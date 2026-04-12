import React, { useEffect, useState, useRef } from 'react';
import { trackEvent } from '../utils/analytics';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, EffectCoverflow } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import 'swiper/css/effect-coverflow';
import ContactUs from '../components/ContactUs';

// ─── FAQ Accordion ────────────────────────────────────────────────────────────
const FAQItem = ({ icon, question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  const iconPaths = {
    question: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    flag: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
  };
  return (
    <motion.div className="group border border-gray-200 rounded-2xl bg-white hover:border-primary/40 hover:shadow-md transition-all duration-300 overflow-hidden" initial={false}>
      <button onClick={() => setIsOpen(!isOpen)} className="w-full p-5 flex items-center justify-between gap-4 text-left focus:outline-none">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[icon]} />
            </svg>
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 leading-snug">{question}</h3>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }} className="flex-shrink-0">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }} className="overflow-hidden">
            <div className="px-5 pb-5 pl-16">
              <p className="text-gray-600 leading-relaxed text-sm sm:text-base">{answer}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Lazy Image ───────────────────────────────────────────────────────────────
const LazyImage = ({ src, alt, className }) => {
  const [isLoading, setIsLoading] = React.useState(true);
  return (
    <div className={`relative ${className}`}>
      {isLoading && <div className="absolute inset-0 bg-gray-100 animate-pulse rounded-xl" />}
      <img src={src} alt={alt} className={`${className} transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`} onLoad={() => setIsLoading(false)} loading="lazy" />
    </div>
  );
};

// ─── Static data ──────────────────────────────────────────────────────────────
const updates = [
  { title: 'Professional PDF reports from lactate tests', date: 'Mar 2026', summary: 'Generate branded PDF reports with lactate + HR curves, color-coded zones, threshold tables, previous test comparison graph, and training recommendations.', link: '/lactate-curve-calculator' },
  { title: 'Bulk Strava interval detection released', date: 'Nov 2025', summary: 'Detect every power fluctuation, auto-create Strava laps, and analyze LT blocks instantly.', link: '/fit-analysis' },
  { title: 'Responsive lactate calculator revamp', date: 'Oct 2025', summary: 'TestingWithoutLogin now loads faster, scales on mobile, and preserves manual adjustments.', link: '/lactate-curve-calculator' },
];

const seoUseCases = [
  { title: 'Free Lactate Curve Calculator', description: 'Upload or enter test steps, visualize lactate vs. power/pace, and export PDF reports. Supports cycling, running, swimming, and triathlon.', link: '/lactate-curve-calculator', anchor: 'free-lactate-curve-calculator' },
  { title: 'Generate PDF from Lactate Test', description: 'Download a professional PDF report with your lactate curve, heart rate overlay, training zones, thresholds, stage results, previous test comparison, and personalized recommendations.', link: '/lactate-curve-calculator', anchor: 'generate-pdf-lactate-test' },
  { title: 'Coach & Athlete Management Software', description: 'Plan workouts, review FIT trainings, sync Strava, and manage lactate history for every athlete inside one secure coach workspace.', link: '/dashboard', anchor: 'coach-athlete-management' },
  { title: 'Training Calendar with Strava & FIT Sync', description: 'Compare planned vs. completed sessions, detect intervals automatically, and keep all sports in a single interactive calendar.', link: '/training-calendar', anchor: 'training-calendar' },
];

const faqItems = [
  { icon: 'question', question: 'What is lactate threshold and why is it important?', answer: "Lactate threshold is the exercise intensity at which lactate begins to accumulate in the blood. It's crucial for endurance athletes because it determines your optimal training zones and racing strategy. Our free lactate calculator helps you find your LT1 and LT2 thresholds accurately." },
  { icon: 'check', question: 'How accurate is the free lactate threshold calculator?', answer: 'LaChart uses multiple professional methods (OBLA, Dmax, IAT, log-log) to calculate your lactate threshold with high accuracy. Our algorithms are based on sports science research and provide reliable results for cycling, running, and triathlon training.' },
  { icon: 'user', question: 'Do I need to register to use the lactate calculator?', answer: 'No registration is required for basic lactate threshold calculations. You can use our free online calculator immediately. However, creating a free account allows you to save results, track progress over time, and access advanced features.' },
  { icon: 'flag', question: 'What sports is LaChart suitable for?', answer: 'LaChart is designed for all endurance sports including cycling, running, triathlon, swimming, and rowing. Our lactate testing protocols and training zone calculations work for any sport that involves sustained aerobic effort.' },
  { icon: 'chart', question: 'How does LaChart compare to expensive lab testing?', answer: 'While lab testing provides the most precise results, LaChart offers professional-grade analysis at a fraction of the cost. Our algorithms use the same calculation methods as expensive sports science software, making advanced lactate analysis accessible to all athletes.' },
  { icon: 'flag', question: 'Can I generate a PDF report from my lactate test?', answer: 'Yes. After completing a lactate test, you can download a professional PDF report that includes your lactate curve with heart rate overlay, all calculated thresholds (LTP1, LTP2, OBLA, IAT), five training zones with power/pace and HR ranges, stage-by-stage results, a comparison graph with your previous test, and personalized training recommendations.' },
];

// (tutorialSteps removed — replaced by VideoTutorialsSection)

// ─── Feature icons ─────────────────────────────────────────────────────────────
const FeatureIcon = ({ type }) => {
  const icons = {
    curve: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    zones: "M13 10V3L4 14h7v7l9-11h-7z",
    history: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    lactate: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
    progress: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    strava: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
    fit: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
    category: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z",
    coach: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    tss: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    pdf: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    calculator: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  };
  return (
    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icons[type] || icons.curve} />
    </svg>
  );
};

// ─── Browser Frame ────────────────────────────────────────────────────────────
const BrowserFrame = ({ children, label }) => (
  <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-xl">
    <div className="flex items-center gap-1.5 px-4 py-2.5 bg-gray-100 border-b border-gray-200">
      <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
      <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
      <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
      {label && <span className="ml-3 text-xs text-gray-400">{label}</span>}
    </div>
    {children}
  </div>
);

// ─── Video Tutorial Section data ──────────────────────────────────────────────
const videoTutorials = [
  {
    id: 'add-testing',
    label: '1. Add a Lactate Test',
    icon: '🧪',
    title: 'How to enter a lactate test',
    description: 'Create a new test, select your sport, enter each stage — power/pace, heart rate and lactate — and save. The curve generates instantly.',
    steps: [
      'Go to Testing → New Test',
      'Select sport: bike, run, or swim',
      'Enter base lactate + each stage value',
      'Hit Save — curve generates instantly',
    ],
    videoSrc: '/videos/add-testing.mp4',
    screenshot: '/screenshots/lactate-testing-page.png',
    screenshotAlt: 'Lactate test entry form',
    tag: 'Getting started',
  },
  {
    id: 'compare-previous-test',
    label: '2. Compare Tests',
    icon: '📈',
    title: 'Compare previous tests',
    description: 'Overlay multiple lactate tests on one chart to see how your fitness is evolving. Watch your curve shift right as you get fitter.',
    steps: [
      'Open a test result',
      'Select previous tests to overlay',
      'See how your curve shifted right',
      'Export a comparison PDF report',
    ],
    videoSrc: '/videos/compare-previous-test.mp4',
    screenshot: '/screenshots/lactate-curve-view.png',
    screenshotAlt: 'Comparing lactate curves',
    tag: 'Analysis',
  },
  {
    id: 'training-page',
    label: '3. Training Log',
    icon: '🏋️',
    title: 'Training log & workouts',
    description: 'Browse your full training history, analyse individual sessions with power and heart rate graphs, and track intervals automatically.',
    steps: [
      'Go to Training',
      'Click any session to open it',
      'Review power / HR / pace graph',
      'Check auto-detected intervals',
    ],
    videoSrc: '/videos/training-page.mp4',
    screenshot: '/screenshots/training-log-page.png',
    screenshotAlt: 'Training log page',
    tag: 'Training',
  },
  {
    id: 'training-calendar',
    label: '4. Training Calendar',
    icon: '📅',
    title: 'Training calendar',
    description: 'See your whole training week at a glance, plan future sessions and track daily load across the month.',
    steps: [
      'Go to Training Calendar',
      'Browse past & future sessions',
      'Click a day to see session details',
      'Monitor weekly training load',
    ],
    videoSrc: '/videos/training-calendar.mp4',
    screenshot: '/screenshots/training-page.png',
    screenshotAlt: 'Training calendar',
    tag: 'Training',
  },
  {
    id: 'dashboard-page',
    label: '5. Dashboard',
    icon: '📊',
    title: 'Reading your fitness dashboard',
    description: 'Understand CTL, ATL and TSB — your fitness, fatigue and form — and use the chart to time your best performances.',
    steps: [
      'View CTL / ATL / TSB chart',
      'Hover to see daily values',
      'Connect Strava for auto-updates',
      'Plan races around peak form',
    ],
    videoSrc: '/videos/dashboard-page.mp4',
    screenshot: '/screenshots/dashboard-home.png',
    screenshotAlt: 'LaChart dashboard',
    tag: 'Analytics',
  },
  {
    id: 'coach-add-athlete',
    label: '6. Coach — Add Athlete',
    icon: '👥',
    title: 'Add an athlete as a coach',
    description: 'Invite athletes to your coaching workspace, assign them a plan and monitor their training and lactate tests from one dashboard.',
    steps: [
      'Go to Athletes → Add Athlete',
      'Enter athlete email and send invite',
      'Athlete accepts and joins your workspace',
      'Monitor their tests and training log',
    ],
    videoSrc: '/videos/coach-add-athlete.mp4',
    screenshot: '/screenshots/dashboard-home.png',
    screenshotAlt: 'Coach athlete management',
    tag: 'Coaching',
  },
];

// ─── Video / Screenshot player ────────────────────────────────────────────────
const TutorialPlayer = ({ tutorial }) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef(null);
  const progressRef = useRef(null);
  const hideTimer = useRef(null);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    setProgress(v.duration ? (v.currentTime / v.duration) * 100 : 0);
  };

  const onEnded = () => { setPlaying(false); setProgress(0); if (videoRef.current) videoRef.current.currentTime = 0; };

  const seek = (e) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
  };

  const nudgeControls = () => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setShowControls(false), 2500);
  };

  if (tutorial.videoSrc) {
    return (
      <BrowserFrame label={`lachart.net — ${tutorial.title}`}>
        <div
          className="relative bg-black select-none"
          style={{ aspectRatio: '16/9' }}
          onMouseMove={nudgeControls}
          onMouseLeave={() => { if (playing) setShowControls(false); }}
        >
          {/* Video */}
          <video
            ref={videoRef}
            src={tutorial.videoSrc}
            className="w-full h-full object-cover cursor-pointer"
            playsInline
            onClick={togglePlay}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
            onEnded={onEnded}
          />

          {/* Big play overlay when paused */}
          {!playing && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/25 cursor-pointer"
              onClick={togglePlay}
            >
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
                <svg className="w-7 h-7 text-primary ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}

          {/* Controls bar */}
          <div
            className={`absolute bottom-0 left-0 right-0 px-3 pb-2 pt-6 transition-opacity duration-200 ${showControls || !playing ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}
          >
            {/* Progress bar */}
            <div
              ref={progressRef}
              className="w-full h-1.5 bg-white/30 rounded-full cursor-pointer mb-2 group"
              onClick={seek}
            >
              <div
                className="h-full bg-primary rounded-full relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Play + time */}
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
                {playing ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <span className="text-white text-xs tabular-nums">
                {fmt(currentTime)} / {fmt(duration)}
              </span>
            </div>
          </div>
        </div>
      </BrowserFrame>
    );
  }

  return (
    <BrowserFrame label={`lachart.net — ${tutorial.title}`}>
      <div className="relative">
        <LazyImage src={tutorial.screenshot} alt={tutorial.screenshotAlt} className="w-full object-cover" />
      </div>
    </BrowserFrame>
  );
};

// ─── Video Tutorials Section ──────────────────────────────────────────────────
const VideoTutorialsSection = () => {
  const [activeId, setActiveId] = useState('lactate-test');
  const active = videoTutorials.find(t => t.id === activeId) || videoTutorials[0];

  return (
    <section id="how-to-use" className="py-10 lg:py-16 bg-white border-t border-gray-100 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Video Tutorials</p>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Learn LaChart step by step
          </h2>
          <p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto">
            Short walkthroughs for every key workflow — from your first lactate test to reading the dashboard.
          </p>
        </div>

        {/* Tab strip */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {videoTutorials.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-all ${
                activeId === t.id
                  ? 'border-primary bg-primary text-white shadow-sm'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900 bg-white'
              }`}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.id === activeId ? t.label : t.icon}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start"
          >
            {/* Video / Screenshot — wider */}
            <div className="lg:col-span-3">
              <TutorialPlayer tutorial={active} />
            </div>

            {/* Description + steps */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              <div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-3">
                  {active.tag}
                </span>
                <h3 className="text-2xl font-extrabold text-gray-900 mb-2">{active.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{active.description}</p>
              </div>

              {/* Steps */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Steps in this tutorial</p>
                <ol className="space-y-3">
                  {active.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-gray-700">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="/lactate-curve-calculator"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors shadow-sm"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  Try it live
                </a>
                <a
                  href="/signup"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Create free account
                </a>
              </div>

              {/* Navigation arrows */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => {
                    const idx = videoTutorials.findIndex(t => t.id === activeId);
                    if (idx > 0) setActiveId(videoTutorials[idx - 1].id);
                  }}
                  disabled={videoTutorials.findIndex(t => t.id === activeId) === 0}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  Previous
                </button>
                <span className="text-xs text-gray-400">
                  {videoTutorials.findIndex(t => t.id === activeId) + 1} / {videoTutorials.length}
                </span>
                <button
                  onClick={() => {
                    const idx = videoTutorials.findIndex(t => t.id === activeId);
                    if (idx < videoTutorials.length - 1) setActiveId(videoTutorials[idx + 1].id);
                  }}
                  disabled={videoTutorials.findIndex(t => t.id === activeId) === videoTutorials.length - 1}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

      </div>
    </section>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────
const About = () => {
  const [showCookieBar, setShowCookieBar] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('cookiesAccepted')) {
      setTimeout(() => setShowCookieBar(true), 1500);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 120);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
    setIsMobileMenuOpen(false);
  };

  const handleAcceptCookies = () => { localStorage.setItem('cookiesAccepted', '1'); setShowCookieBar(false); };

  const categoryMap = { 'Core Feature': 'Testing', 'Analysis': 'Analysis', 'Training': 'Testing', 'Progress': 'Analytics', 'Integration': 'Integration', 'Organization': 'Management', 'Coaching': 'Management', 'Planning': 'Planning', 'Analytics': 'Analytics', 'Tools': 'Tools' };

  const features = [
    { title: 'Lactate Curve Generation', description: 'Enter test values and automatically generate your lactate curve. Calculate LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA (2.0–3.5), and baseline adjustments.', icon: 'curve', category: 'Core Feature' },
    { title: 'Training Zone Calculation', description: 'Auto-calculate 5 training zones with precise power/pace ranges and percentages. Customized for cycling, running, and swimming.', icon: 'zones', category: 'Core Feature' },
    { title: 'Historical Test Comparison', description: 'Store all lactate tests and compare curves over time. Track how your zones shift and improve by overlaying multiple test curves.', icon: 'history', category: 'Analysis' },
    { title: 'Lactate Recording to Intervals', description: 'Record lactate values directly to training intervals. Categorize workouts by intensity and build a comprehensive database.', icon: 'lactate', category: 'Training' },
    { title: 'Training Progress Tracking', description: 'Compare the same workout type over time. Track how your pace/power improves at the same lactate level across months.', icon: 'progress', category: 'Progress' },
    { title: 'Strava & FIT File Sync', description: 'Sync workouts from Strava automatically or upload FIT files from Garmin, Wahoo, and any device. Full interval detection, power/pace graphs, heart rate zones, and TSS analysis.', icon: 'strava', category: 'Integration' },
    { title: 'Training Categorization', description: 'Auto-categorize workouts by intensity. Classify sessions as Threshold, VO2max, Endurance, Tempo, or Recovery.', icon: 'category', category: 'Organization' },
    { title: 'Coach & Athlete Management', description: 'Manage multiple athletes, view historical lactate tests, track training calendars, and monitor lactate values from workouts.', icon: 'coach', category: 'Coaching' },
    { title: 'Training Calendar', description: 'Interactive calendar showing all workouts from Strava, FIT files, and manual entries. View training load across your timeline.', icon: 'calendar', category: 'Planning' },
    { title: 'TSS & Performance Analytics', description: 'Calculate Training Stress Score per workout. Analyze load, intensity distribution, and performance trends.', icon: 'tss', category: 'Analytics' },
    { title: 'Free Lactate Calculator', description: 'No registration required. Instantly generate a lactate curve with all threshold calculations and export to PDF.', icon: 'calculator', category: 'Tools' },
    { title: 'PDF Report Generation', description: 'Professional PDF reports with lactate curve, HR overlay, thresholds, color-coded zones, stage results, and recommendations.', icon: 'pdf', category: 'Tools' },
  ];

  const filteredFeatures = selectedCategory === 'All' ? features : features.filter(f => categoryMap[f.category] === selectedCategory);

  const audiences = [
    { title: 'Coaches', description: 'Manage multiple athletes, view historical lactate tests, track training calendars, and monitor lactate values from workouts.', icon: '👨‍🏫' },
    { title: 'Athletes', description: 'Generate lactate curves, calculate training zones, track progress over time, and record lactate to intervals.', icon: '🏃‍♂️' },
    { title: 'Cyclists', description: 'Test with power, calculate zones, sync from Strava, and analyze TSS and training load.', icon: '🚴' },
    { title: 'Triathletes', description: 'Test with pace, track improvements in same workouts over time, and compare historical tests.', icon: '🏊' },
  ];

  const faqStructuredData = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqItems.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Lactate Curve Analyzer, Lactate Threshold Calculator & Lactate Testing PDF Reports | LaChart</title>
        <link rel="canonical" href="https://lachart.net/about" />
        <meta name="description" content="Generate lactate curves from test data, calculate all critical thresholds (LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA), and automatically determine training zones. Download professional lactate testing PDF reports." />
        <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
        <meta name="theme-color" content="#767EB5" />
        <meta property="og:title" content="Lactate Curve Analyzer & Lactate Testing PDF Reports | LaChart" />
        <meta property="og:image" content="https://lachart.net/images/lachart1.png" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://lachart.net/about" />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(faqStructuredData)}</script>
      </Helmet>

      {/* ── Top Navbar ─────────────────────────────────────────────────────── */}
      <nav className="w-full bg-white border-b border-gray-100 py-4 px-6 flex items-center justify-between z-20 relative">
        <a href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <img src="/images/LaChart.png" alt="LaChart Logo" className="h-9 w-11" />
          <span className="text-xl font-bold text-gray-900 tracking-tight">LaChart</span>
        </a>
        <div className="flex items-center gap-3">
          <a href="/login" className="text-gray-600 font-medium hover:text-gray-900 transition-colors text-sm px-3 py-2">Login</a>
          <a href="/signup" className="px-4 py-2 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm shadow-sm">Get Started</a>
        </div>
      </nav>

      {/* ── Demo Banner ────────────────────────────────────────────────────── */}
      <div className="w-full bg-gradient-to-r from-primary to-secondary py-2.5 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3">
          <span className="text-white text-sm font-medium text-center">✨ Try calculating lactate thresholds for free — no sign up needed</span>
          <a href="/lactate-curve-calculator" className="inline-block px-5 py-1.5 rounded-lg bg-white text-primary font-bold text-sm shadow hover:bg-gray-50 transition-all whitespace-nowrap">Try Demo</a>
        </div>
      </div>

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 transition-all duration-300 ${isScrolled ? 'translate-y-0 shadow-md' : '-translate-y-full'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <img src="/images/LaChart.png" alt="LaChart" className="h-8 w-10" />
            <span className="text-lg font-bold text-gray-900">LaChart</span>
          </a>
          <div className="hidden lg:flex items-center gap-1">
            {[['features','Features'],['connect','Connect'],['solutions','Solutions'],['guide','Guide'],['how-to-use','▶ Tutorials'],['contact','Contact']].map(([id, label]) => (
              <button key={id} onClick={() => scrollToSection(id)} className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-primary transition-colors">{label}</button>
            ))}
          </div>
          <div className="hidden lg:flex items-center gap-3">
            <a href="/login" className="text-gray-600 hover:text-gray-900 font-medium text-sm">Login</a>
            <a href="/signup" className="px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark text-sm shadow-sm">Get Started</a>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden p-2 text-gray-600 hover:text-gray-900">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 px-4 py-3 flex flex-col gap-1 bg-white">
            {[['features','Features'],['connect','Connect'],['solutions','Solutions'],['guide','Guide'],['how-to-use','▶ Tutorials'],['contact','Contact']].map(([id, label]) => (
              <button key={id} onClick={() => scrollToSection(id)} className="text-left px-3 py-2 text-sm text-gray-600 hover:text-primary">{label}</button>
            ))}
            <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
              <a href="/login" className="flex-1 text-center py-2 text-sm text-gray-600">Login</a>
              <a href="/signup" className="flex-1 text-center py-2 text-sm bg-primary text-white rounded-lg font-semibold">Get Started</a>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section id="hero" className="relative overflow-hidden bg-white">

        {/* ── Background: gradient mesh + chart grid ── */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Soft colour blobs */}
          <div className="absolute top-[-10%] left-[-5%] w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[100px]" />
          <div className="absolute top-[30%] right-[20%] w-[300px] h-[300px] bg-purple-300/8 rounded-full blur-[80px]" />

          {/* Chart-style grid lines — very subtle, references lactate graph aesthetic */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.035]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="chart-grid" width="80" height="60" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 60" fill="none" stroke="#767EB5" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#chart-grid)" />
          </svg>

          {/* Diagonal accent line — like a curve on a chart */}
          <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
            <path d="M 0 80% Q 30% 70% 60% 40% T 100% 10%" fill="none" stroke="#767EB5" strokeWidth="2" strokeDasharray="8 6"/>
          </svg>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center py-10 lg:py-16">

            {/* ── Left: text ── */}
            <div className="flex flex-col justify-center">
              {/* Badge */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/30 bg-primary/8 text-primary text-xs sm:text-sm font-semibold mb-7 self-start">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Science-based lactate analysis
              </motion.div>

              {/* Headline */}
              <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.05 }}
                className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-gray-900 leading-[1.06] tracking-tight mb-6">
                Train smarter<br />
                with{' '}
                <span className="relative inline-block">
                  <span className="bg-gradient-to-r from-primary via-secondary to-purple-500 bg-clip-text text-transparent">lactate data</span>
                  {/* Underline squiggle */}
                  <svg className="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 200 6" preserveAspectRatio="none">
                    <path d="M0 5 Q25 0 50 5 Q75 10 100 5 Q125 0 150 5 Q175 10 200 5" fill="none" stroke="url(#squiggle-grad)" strokeWidth="2.5" strokeLinecap="round"/>
                    <defs><linearGradient id="squiggle-grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#767EB5"/><stop offset="100%" stopColor="#599FD0"/></linearGradient></defs>
                  </svg>
                </span>
              </motion.h1>

              <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
                className="text-base sm:text-lg text-gray-500 max-w-lg mb-8 leading-relaxed">
                Generate lactate curves, calculate LT1 &amp; LT2, build training zones, and track your performance — all in one platform for athletes and coaches.
              </motion.p>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
                className="flex flex-col sm:flex-row gap-3 mb-10">
                <a href="/signup" onClick={() => trackEvent('cta_click', { label: 'hero_signup' })}
                  className="inline-flex items-center justify-center gap-2 bg-primary text-white font-bold px-7 py-3.5 rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-dark transition-all hover:-translate-y-0.5 text-sm sm:text-base">
                  Start for Free
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
                <a href="/lactate-curve-calculator" onClick={() => trackEvent('cta_click', { label: 'hero_demo' })}
                  className="inline-flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-semibold px-7 py-3.5 rounded-xl hover:border-primary/40 hover:bg-gray-50 transition-all text-sm sm:text-base">
                  Try Demo — No Sign Up
                </a>
              </motion.div>

              {/* Stat pills */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.7, delay: 0.3 }}
                className="flex flex-wrap gap-3">
                {[
                  {
                    label: 'Free to start',
                    color: 'text-emerald-600',
                    bg: 'bg-emerald-50 border-emerald-200',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    ),
                  },
                  {
                    label: 'LT1 · LT2 · OBLA',
                    color: 'text-primary',
                    bg: 'bg-primary/8 border-primary/20',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    ),
                  },
                  {
                    label: 'PDF reports',
                    color: 'text-rose-600',
                    bg: 'bg-rose-50 border-rose-200',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    ),
                  },
                  {
                    label: 'Strava sync',
                    color: 'text-orange-600',
                    bg: 'bg-orange-50 border-orange-200',
                    icon: (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    ),
                  },
                ].map(item => (
                  <span key={item.label} className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold ${item.bg} ${item.color}`}>
                    {item.icon}
                    {item.label}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* ── Right: hero image with floating badges ── */}
            <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
              className="relative flex items-center justify-center lg:py-12">

              {/* Glow behind image */}
              <div className="absolute inset-8 bg-gradient-to-br from-primary/20 via-secondary/15 to-purple-300/10 rounded-3xl blur-3xl" />

              {/* Main image */}
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/60 w-full max-w-lg lg:max-w-none">
                <img
                  src="/images/lactate_testing.png"
                  alt="Lactate testing with LaChart"
                  className="w-full object-cover"
                />
              </div>

              {/* Floating metric badge — top left */}
              <motion.div
                initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.6 }}
                className="absolute -top-3 left-2 sm:-top-4 sm:-left-4 bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">LT2 Threshold</p>
                  <p className="text-sm font-extrabold text-gray-900">340 W</p>
                </div>
              </motion.div>

              {/* Floating metric badge — bottom right */}
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.75 }}
                className="absolute -bottom-3 right-2 sm:-bottom-4 sm:-right-4 bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Zone 2 Power</p>
                  <p className="text-sm font-extrabold text-gray-900">187–255 W</p>
                </div>
              </motion.div>

              {/* Floating metric badge — mid right */}
              <motion.div
                initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.9 }}
                className="absolute top-1/2 -translate-y-1/2 -right-3 sm:-right-6 bg-white rounded-2xl shadow-xl border border-gray-100 px-3 py-2.5 hidden sm:flex items-center gap-2.5"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm">🧪</span>
                </div>
                <div>
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">La baseline</p>
                  <p className="text-sm font-extrabold text-gray-900">1.2 mmol/L</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </section>

      {/* ── Social proof strip ─────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="border-y border-gray-100 bg-gray-50 py-4">
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap justify-center gap-x-10 gap-y-2 text-sm text-gray-500">
          {['Cycling · Running · Triathlon · Swimming', 'LT1, LT2, OBLA, IAT, D-max, Log-log', 'Strava & FIT file sync', 'PDF reports in seconds', 'Coach & athlete workspace'].map(item => (
            <span key={item} className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              {item}
            </span>
          ))}
        </div>
      </motion.div>

      {/* ── Features Grid ──────────────────────────────────────────────────── */}
      <section id="features" className="py-10 lg:py-16 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Platform Features</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">The complete training ecosystem</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">Everything for lactate-based performance — testing, analysis, tracking, and coaching in one place.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {['All', 'Analysis', 'Management', 'Planning', 'Integration', 'Tools', 'Testing', 'Analytics'].map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full border text-sm font-medium transition-all ${selectedCategory === cat ? 'border-primary bg-primary text-white shadow-sm' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900'}`}>
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredFeatures.map((feature, i) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }}
                className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-primary/40 hover:shadow-lg transition-all duration-300">
                <div className="w-10 h-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center mb-4 group-hover:bg-primary/12 transition-colors">
                  <FeatureIcon type={feature.icon} />
                </div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">{feature.category}</p>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 1 — Lactate Curve (text left, image right) ─────────────────────── */}
      <section className="py-10 lg:py-20 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Core Feature</p>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">Lactate Curve Generation</h3>
              <p className="text-gray-500 text-lg leading-relaxed mb-6">Enter your test values — power, heart rate, lactate, or pace — and instantly generate your lactate curve. Calculate all critical thresholds in one clear, interactive graph.</p>
              <div className="flex flex-wrap gap-2">
                {['LT1 & LT2', 'OBLA 2.0–3.5', 'IAT', 'D-max', 'Log-log'].map(tag => (
                  <span key={tag} className="px-3 py-1 rounded-full border border-primary/25 bg-primary/8 text-primary text-sm font-medium">{tag}</span>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }}>
              <BrowserFrame label="Lactate Curve — Power vs Lactate">
                <LazyImage src="/images/lactate_testing.png" alt="Lactate curve with thresholds" className="w-full object-cover" />
              </BrowserFrame>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── 2 — Connect (image left, text right) ───────────────────────────── */}
      <section id="connect" className="py-10 lg:py-20 bg-gray-50 border-t border-gray-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <BrowserFrame>
                <LazyImage src="/images/lachart_training.png" alt="LaChart training sync" className="w-full object-cover" />
              </BrowserFrame>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }}>
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Integrations</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">Sync, Link, and Connect</h2>
              <p className="text-gray-500 text-lg mb-8 leading-relaxed">Connect Strava. Upload FIT files or sync automatically. Import all your training data including power, heart rate, cadence, and speed. Analyze TSS, training load, and performance metrics — all in one platform.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[['Strava', 'Auto-sync activities'], ['FIT Files', 'Garmin, Wahoo, etc.'], ['Manual Entry', 'Log any workout']].map(([name, sub]) => (
                  <div key={name} className="flex items-start gap-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all">
                    <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-gray-900 font-semibold text-sm">{name}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Feature deep-dives ─────────────────────────────────────────────── */}
      <section className="py-10 lg:py-16 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-28">

          {/* 3 — Historical Test (text left, image right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <p className="text-secondary font-semibold tracking-widest text-xs uppercase mb-3">Progress Tracking</p>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">Historical Test Comparison</h3>
              <p className="text-gray-500 text-lg leading-relaxed mb-6">Overlay multiple lactate tests to visualize your progression. Watch your LT1 and LT2 move to higher intensities as your fitness improves.</p>
              <div className="space-y-3">
                {['Compare multiple test curves on one chart', 'Track zone shifts over training seasons', 'Visualize threshold improvements', 'Export comparison PDF reports'].map(f => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-gray-700 text-sm">{f}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }}>
              <img src="/images/lactate_curve.jpg" alt="Runners training with lactate curve comparison" className="w-full rounded-2xl shadow-2xl object-cover" />
            </motion.div>
          </div>

          {/* 4 — Training Zones (image left, text right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <img src="/images/zones-generator.png" alt="Runners in mountains with training zones table" className="w-full rounded-2xl shadow-2xl object-cover" />
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }}>
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Training Zones</p>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">5 Personalized Zones from Your Data</h3>
              <p className="text-gray-500 text-lg leading-relaxed mb-6">After your lactate test, LaChart automatically generates five training zones with precise power/pace and heart rate ranges — customized for cycling, running, and swimming.</p>
              <div className="space-y-2.5">
                {[['Zone 1–2', 'Recovery & endurance base', '#4BA87D'], ['Zone 3', 'Tempo / aerobic development', '#767EB5'], ['Zone 4', 'Lactate threshold', '#E8A838'], ['Zone 5', 'VO2max & above', '#E05347']].map(([zone, desc, color]) => (
                  <div key={zone} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-gray-900 font-semibold text-sm w-16 flex-shrink-0">{zone}</span>
                    <span className="text-gray-500 text-sm">{desc}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* 5 — Progress (text left, image right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <p className="text-secondary font-semibold tracking-widest text-xs uppercase mb-3">Analysis</p>
              <h3 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">Lactate Recording & Progress Tracking</h3>
              <p className="text-gray-500 text-lg leading-relaxed mb-6">Record lactate values to intervals and compare the same workout type at the same lactate level to see your progress across months.</p>
              <div className="space-y-3">
                {['Record lactate to intervals', 'Categorize by intensity type', 'Compare same workouts over time', 'Track pace/power improvements'].map(f => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-gray-700 text-sm">{f}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }}>
              <BrowserFrame label="Training Analytics">
                <LazyImage src="/images/lachart5.jpeg" alt="Lactate recording" className="w-full object-cover" />
              </BrowserFrame>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Solutions ──────────────────────────────────────────────────────── */}
      <section id="solutions" className="py-10 lg:py-16 bg-gray-50 border-t border-gray-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="mb-12">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Solutions</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight max-w-2xl">Everything for lactate testing, coaching &amp; planning</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {seoUseCases.map((useCase, i) => (
              <motion.article key={useCase.title} id={useCase.anchor}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: i * 0.1 }}
                className="group rounded-2xl border border-gray-200 bg-white p-6 hover:border-primary/40 hover:shadow-md transition-all duration-300">
                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-primary transition-colors">{useCase.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-5">{useCase.description}</p>
                <a href={useCase.link} onClick={() => trackEvent('cta_click', { label: `about_use_case_${useCase.anchor}` })}
                  className="inline-flex items-center gap-1.5 text-primary font-semibold text-sm">
                  Explore <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── PDF Reports ────────────────────────────────────────────────────── */}
      <section id="lactate-testing-pdf" className="py-10 lg:py-16 bg-white border-t border-gray-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">PDF Reports</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">Turn any lactate test into a professional PDF in seconds</h2>
              <p className="text-gray-500 text-lg leading-relaxed mb-8">LaChart generates branded PDF reports with everything a sports scientist or coach needs — no Excel, no manual charting.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                {[
                  { title: "What's included", items: ['Lactate curve + HR overlay', 'All thresholds (LT1, LT2, OBLA, IAT)', '5 training zones', 'Stage-by-stage table', 'Previous test comparison'] },
                  { title: "Who it's for", items: ['Sports medicine labs', 'Endurance coaches', 'Self-coached athletes', 'Teams & clinics'] },
                  { title: 'Why LaChart', items: ['No Excel templates', 'Beautiful PDF layout', 'Cycling, running, swim', 'Secure cloud storage'] },
                ].map(col => (
                  <div key={col.title} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-3">{col.title}</p>
                    <ul className="space-y-1.5">
                      {col.items.map(item => <li key={item} className="text-gray-600 text-xs flex items-start gap-1.5"><span className="text-primary mt-0.5">•</span>{item}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <a href="/lactate-curve-calculator" onClick={() => trackEvent('cta_click', { label: 'about_pdf_cta' })}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">
                  Generate free lactate PDF
                </a>
                <p className="text-xs text-gray-400">No card required · Export in seconds</p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }}>
              <BrowserFrame>
                <LazyImage src="/images/lachart-test.png" alt="Lactate test PDF report" className="w-full object-cover" />
              </BrowserFrame>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Lactate Guide ──────────────────────────────────────────────────── */}
      <section id="guide" className="py-10 lg:py-16 bg-gray-50 border-t border-gray-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }} className="order-2 lg:order-1">
              <BrowserFrame>
                <LazyImage src="/images/lachart3.jpeg" alt="Lactate analysis" className="w-full object-cover" />
              </BrowserFrame>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }} className="order-1 lg:order-2">
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Learn</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-5 tracking-tight">Master Lactate Threshold Training</h2>
              <p className="text-gray-500 text-lg leading-relaxed mb-8">Discover the science behind lactate, understand what lactate threshold means, and learn how to improve your performance through proper training methods.</p>
              <div className="space-y-5 mb-8">
                {[['Complete Theory', 'Learn what lactate is, how it affects your body, and why the threshold matters for endurance performance.'], ['Testing Protocols', 'Understand different methods to measure lactate threshold, from lab tests to field estimations.'], ['Training Strategies', 'Discover proven methods to increase your lactate threshold and improve endurance performance.']].map(([title, desc]) => (
                  <div key={title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </div>
                    <div>
                      <h3 className="text-gray-900 font-semibold mb-1">{title}</h3>
                      <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <a href="/lactate-guide" onClick={() => trackEvent('cta_click', { label: 'about_guide_section' })}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-colors shadow-sm">
                Read the Complete Guide
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Real App Screenshots ───────────────────────────────────────────── */}
      <section className="py-10 lg:py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="text-center mb-14">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Real App · Live screenshots</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">See what LaChart looks like inside</h2>
            <p className="text-gray-500 text-base max-w-xl mx-auto">These screenshots are taken directly from a real LaChart account — no mockups.</p>
          </motion.div>

          {/* Two featured screenshots side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Dashboard */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
              <BrowserFrame label="lachart.net/dashboard — Form & Fitness">
                <LazyImage src="/screenshots/dashboard-home.png" alt="LaChart dashboard with Form and Fitness chart" className="w-full object-cover" />
              </BrowserFrame>
              <div className="mt-3 px-1">
                <p className="text-sm font-semibold text-gray-800">Dashboard · Form &amp; Fitness</p>
                <p className="text-xs text-gray-500 mt-0.5">CTL, ATL, and TSB at a glance. Track your fitness, fatigue and form trends.</p>
              </div>
            </motion.div>

            {/* Testing page */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.1 }}>
              <BrowserFrame label="lachart.net/testing — Lactate Testing">
                <LazyImage src="/screenshots/lactate-testing-page.png" alt="LaChart lactate testing page with LT recommendations and trends" className="w-full object-cover" />
              </BrowserFrame>
              <div className="mt-3 px-1">
                <p className="text-sm font-semibold text-gray-800">Lactate Testing · AI Recommendations</p>
                <p className="text-xs text-gray-500 mt-0.5">Smart protocol suggestions based on your previous test, plus LT1/LT2 trend over time.</p>
              </div>
            </motion.div>
          </div>

          {/* Two smaller screenshots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.2 }}>
              <BrowserFrame label="Training Log">
                <LazyImage src="/screenshots/training-log-page.png" alt="LaChart training log" className="w-full object-cover" />
              </BrowserFrame>
              <div className="mt-3 px-1">
                <p className="text-sm font-semibold text-gray-800">Training Log · Interval Analysis</p>
                <p className="text-xs text-gray-500 mt-0.5">Every interval with power, HR and lactate in one clean log.</p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: 0.3 }}>
              <BrowserFrame label="Training Calendar">
                <LazyImage src="/screenshots/training-page.png" alt="LaChart training calendar" className="w-full object-cover" />
              </BrowserFrame>
              <div className="mt-3 px-1">
                <p className="text-sm font-semibold text-gray-800">Training Calendar · Monthly View</p>
                <p className="text-xs text-gray-500 mt-0.5">Plan and review sessions across weeks and months with Strava sync.</p>
              </div>
            </motion.div>
          </div>

          <div className="text-center">
            <a href="/signup" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-colors shadow-sm text-sm">
              Try it yourself – sign up free
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── Screenshots Swiper ─────────────────────────────────────────────── */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10 text-center">
          <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Gallery</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">More views of LaChart</h2>
        </div>
        <Swiper effect={'coverflow'} grabCursor centeredSlides initialSlide={2} slidesPerView={'auto'}
          coverflowEffect={{ rotate: 0, stretch: 0, depth: 100, modifier: 2.5, slideShadows: false }}
          pagination={{ clickable: true }} navigation modules={[EffectCoverflow, Pagination, Navigation]} className="mySwiper !pb-12">
          {[
            { src: '/screenshots/dashboard-home.png', alt: 'Dashboard Form & Fitness', title: 'Dashboard · CTL / ATL / TSB' },
            { src: '/screenshots/lactate-testing-page.png', alt: 'Lactate Testing', title: 'Lactate Testing & LT Trends' },
            { src: '/images/lactate-curve-calculator.png', alt: 'Lactate Curve Calculator', title: 'Lactate Curve Calculator' },
            { src: '/images/Form-fitness-chart.png', alt: 'Form & Fitness Chart', title: 'Form & Fitness Trend' },
            { src: '/images/training-calendar.png', alt: 'Training Calendar', title: 'Training Calendar' },
            { src: '/images/training-analytics.png', alt: 'Training Analytics', title: 'Analytics & TSS' },
          ].map(image => (
            <SwiperSlide key={image.alt} className="!w-[300px] sm:!w-[450px] md:!w-[600px]">
              {({ isActive }) => (
                <div className={`relative transition-all duration-300 ${isActive ? 'scale-100' : 'scale-90 opacity-60'}`}>
                  <BrowserFrame label={image.title}>
                    <LazyImage src={image.src} alt={image.alt} className="w-full h-[200px] sm:h-[280px] md:h-[360px] object-contain bg-gray-50" />
                  </BrowserFrame>
                </div>
              )}
            </SwiperSlide>
          ))}
        </Swiper>
      </section>

      {/* ── For Athletes & Coaches ─────────────────────────────────────────── */}
      <section id="coaching" className="py-10 lg:py-16 bg-gray-50 border-t border-gray-100 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">For Everyone</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">Built for athletes and coaches</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">Whether you're self-coached or managing a team, LaChart scales to your needs.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {audiences.map((a, i) => (
              <motion.div key={a.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                className="group rounded-2xl border border-gray-200 bg-white p-6 text-center hover:border-primary/40 hover:shadow-md transition-all">
                <div className="text-4xl mb-4">{a.icon}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{a.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{a.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ───────────────────────────────────────────────────── */}
      <section id="testimonials" className="py-10 lg:py-16 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Testimonials</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Trusted by endurance athletes</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { quote: "When I started training for my first ultramarathon and half Ironman, I had no idea how to train. LaChart makes every workout simple. It's synced to my devices, and all I have to do is press start!", author: "Chiara", role: "Runner, Cyclist, Triathlete" },
              { quote: "I can rely on this software to gauge how tired I am, how much training load I'm getting, and even track lactate in relation to my scheduled training sessions.", author: "Sterling", role: "Cyclist" },
              { quote: "I hired a coach who dialed in my training, and at the age of 52, I had my strongest, most successful season yet.", author: "Marc", role: "Cyclist" },
              { quote: "It's worth every penny, and it gives me a huge competitive advantage. Makes you want to keep it as a secret weapon.", author: "Maciej", role: "Triathlete" },
            ].map((t, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}
                className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col shadow-sm">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => <svg key={j} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>)}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed flex-1 mb-5">"{t.quote}"</p>
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-gray-900 font-semibold text-sm">{t.author}</p>
                  <p className="text-gray-400 text-xs">{t.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why LaChart ────────────────────────────────────────────────────── */}
      <section className="py-10 lg:py-16 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
            <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6 }}>
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Why LaChart</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-8 tracking-tight">Everything in one platform</h2>
              <div className="space-y-4">
                {['Generate lactate curves from test data (power, heart rate, lactate, pace)', 'Calculate all critical thresholds: LT1, LT2, LTP1, LTP2, IAT, Log-log, OBLA (2.0–3.5)', 'Automatically determine 5 training zones with precise power/pace ranges', 'Compare historical tests and track zone shifts over time', 'Record lactate values to training intervals and categorize workouts', 'Compare same workout types over time to track progress', 'Sync with Strava — analyze TSS and training load automatically', 'Coach management: track multiple athletes from one dashboard', 'Generate professional PDF reports with lactate curve, HR overlay, and zones'].map(item => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-gray-700 text-sm leading-relaxed">{item}</span>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.1 }} className="flex justify-center">
              <img src="/images/lachart3.png" alt="LaChart analytics" className="w-auto max-w-xs drop-shadow-2xl" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Coach workspace ────────────────────────────────────────────────── */}
      <section className="py-10 lg:py-16 bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="text-center mb-12">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Collaboration</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Coach &amp; athlete workspace</h2>
          </motion.div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
                  <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                </div>
                <h3 className="text-gray-900 font-bold text-lg">Coach workspace</h3>
              </div>
              {[['1', 'Create athlete profiles', 'Add each athlete once. Assign roles and share credentials securely.'], ['2', 'Upload trainings & tests', 'Import FIT/Strava sessions or log manual workouts. Attach lactate tests and save notes.'], ['3', 'Monitor calendars and intervals', 'Switch athletes via the dashboard. Detect intervals automatically and compare planned vs. completed.']].map(([num, title, desc]) => (
                <div key={num} className="flex gap-4 mb-5 last:mb-0">
                  <span className="w-7 h-7 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{num}</span>
                  <div>
                    <p className="text-gray-900 font-semibold text-sm mb-1">{title}</p>
                    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay: 0.1 }} className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-secondary/8 flex items-center justify-center">
                  <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-gray-900 font-bold text-lg">Athlete workspace</h3>
              </div>
              {[['A', 'Log in and connect Strava', 'Authenticate, sync devices, or type workouts manually so each training flows into the shared calendar.'], ['B', 'Record tests on site or remotely', 'Use the lactate form to input steps and intensity. Results instantly populate coach dashboards.'], ['C', 'Collaborate in real time', 'Coaches adjust training load, athletes confirm sessions. Everyone sees the same analytics and reports.']].map(([id, title, desc]) => (
                <div key={id} className="flex gap-4 mb-5 last:mb-0">
                  <span className="w-7 h-7 rounded-full bg-secondary text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{id}</span>
                  <div>
                    <p className="text-gray-900 font-semibold text-sm mb-1">{title}</p>
                    <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
              <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-4">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Access control</p>
                <p className="text-gray-600 text-sm">Athletes only see their own data. Coaches switch between athletes, admins manage the entire organization.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Latest Updates ─────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-10">
            <div>
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-2">Changelog</p>
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">What's new in LaChart</h2>
            </div>
            <a href="/changelog" className="text-primary font-semibold hover:text-primary-dark flex items-center gap-1 text-sm">View full changelog <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></a>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {updates.map((item, i) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.4, delay: i * 0.1 }} className="rounded-2xl border border-gray-200 bg-white p-6 flex flex-col hover:border-primary/40 hover:shadow-md transition-all">
                <p className="text-xs text-primary uppercase tracking-wider font-semibold mb-2">{item.date}</p>
                <h3 className="text-lg font-bold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-5 flex-1">{item.summary}</p>
                <a href={item.link} className="inline-flex items-center gap-1.5 text-primary font-semibold text-sm">
                  Learn more <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Video Tutorials ────────────────────────────────────────────────── */}
      <VideoTutorialsSection />

      {/* ── Try Demo ───────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5 p-8 sm:p-12 flex flex-col md:flex-row items-center gap-10">
            <div className="flex-1">
              <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">Free Demo</p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-4 tracking-tight">Try the Lactate Test Demo</h2>
              <p className="text-gray-600 leading-relaxed mb-2">Fill in your own test data and the app instantly generates a lactate curve with <strong>LT1</strong>, <strong>LT2</strong>, OBLA, IAT, log-log, and training zones.</p>
              <p className="text-gray-400 text-sm mb-6">No login required. Your data won't be saved.</p>
              <a href="/lactate-curve-calculator" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/20">
                Try the Demo Now <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </a>
            </div>
            <div className="flex-1 w-full">
              <BrowserFrame>
                <LazyImage src="/images/lachart-test.png" alt="Lactate Test Demo" className="w-full object-cover" />
              </BrowserFrame>
            </div>
          </motion.div>
        </div>
      </section>


      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-10 lg:py-16 bg-gray-50 border-t border-gray-100 scroll-mt-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5 }} className="text-center mb-12">
            <p className="text-primary font-semibold tracking-widest text-xs uppercase mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 tracking-tight">Frequently Asked Questions</h2>
            <p className="text-gray-500">Everything you need to know about lactate threshold testing and LaChart</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.5, delay: 0.1 }} className="space-y-3">
            {faqItems.map(item => <FAQItem key={item.question} {...item} />)}
          </motion.div>
        </div>
      </section>

      {/* ── Contact ────────────────────────────────────────────────────────── */}
      <section id="contact" className="bg-white border-t border-gray-100 scroll-mt-20">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}>
          <ContactUs />
        </motion.div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="py-32 bg-gradient-to-br from-primary via-primary to-purple-600 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="relative max-w-4xl mx-auto px-4 text-center">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 tracking-tight">
            Ready to go all in?
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
            className="text-xl text-purple-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Supercharge your training data and cut through the noise with LaChart. Bring it all under one roof.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/signup" onClick={() => trackEvent('cta_click', { label: 'footer_get_started' })}
              className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-white text-primary font-bold text-lg hover:bg-gray-50 transition-all hover:-translate-y-0.5 shadow-xl">
              Sign Up Free
            </a>
            <a href="/login" onClick={() => trackEvent('cta_click', { label: 'footer_sign_in' })}
              className="inline-flex items-center justify-center px-10 py-4 rounded-xl border-2 border-white text-white font-bold text-lg hover:bg-white hover:text-primary transition-all">
              Sign In
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div className="md:col-span-2">
              <a href="/" className="flex items-center gap-2 mb-4">
                <img src="/images/LaChart.png" alt="LaChart" className="h-9 w-11" />
                <span className="text-xl font-bold text-gray-900">LaChart</span>
              </a>
              <p className="text-gray-500 text-sm leading-relaxed max-w-xs">Advanced lactate testing and training analysis for endurance athletes and coaches.</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Product</h3>
              <div className="space-y-2">
                {[['Features', '#features'], ['How to Use', '#how-to-use'], ['Lactate Guide', '/lactate-guide'], ['Documentation', '/documentation'], ['Changelog', '/changelog']].map(([label, href]) => (
                  <a key={label} href={href} className="block text-sm text-gray-500 hover:text-primary transition-colors">{label}</a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Tools</h3>
              <div className="space-y-2">
                {[['Lactate Calculator', '/lactate-curve-calculator'], ['FTP Calculator', '/ftp-calculator'], ['TSS Calculator', '/tss-calculator'], ['Zone 2 Calculator', '/zone2-calculator'], ['Training Zones', '/training-zones-calculator']].map(([label, href]) => (
                  <a key={label} href={href} className="block text-sm text-gray-500 hover:text-primary transition-colors">{label}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-400">© {new Date().getFullYear()} LaChart. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="/privacy" className="text-xs text-gray-400 hover:text-primary transition-colors">Privacy Policy</a>
              <a href="/terms" className="text-xs text-gray-400 hover:text-primary transition-colors">Terms of Service</a>
              <a href="/support" className="text-xs text-gray-400 hover:text-primary transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── Cookie bar ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showCookieBar && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5">
            <p className="text-sm text-gray-600 mb-4">We use cookies to improve your experience. By continuing, you agree to our <a href="/privacy" className="text-primary underline">Privacy Policy</a>.</p>
            <div className="flex gap-2">
              <button onClick={handleAcceptCookies} className="flex-1 py-2 bg-primary text-white font-semibold text-sm rounded-lg hover:bg-primary-dark transition-colors">Accept</button>
              <button onClick={() => setShowCookieBar(false)} className="flex-1 py-2 border border-gray-200 text-gray-600 font-semibold text-sm rounded-lg hover:border-gray-300 transition-colors">Decline</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default About;
