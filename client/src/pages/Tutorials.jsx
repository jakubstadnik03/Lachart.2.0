// Dedicated tutorials page — restores the video walkthroughs that lived on
// the old About page. Reachable at /how-to-use and /tutorials.
import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';

const LC = {
  primary:      '#767EB5',
  primaryDark:  '#5E6590',
  primaryTint:  '#EEF0F8',
  secondary:    '#599FD0',
  accent:       '#7C3AED',
  ink:          '#0F1729',
  text:         '#1F2738',
  muted:        '#6B7280',
  border:       'rgba(180,190,210,.30)',
};

/* ─── Browser frame ─────────────────────────────────────────────────────── */
const BrowserFrame = ({ label, children }) => (
  <div style={{
    borderRadius: 20, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,.7)',
    boxShadow: '0 30px 60px -20px rgba(15,23,41,.25)',
    background: '#fff',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 14px',
      background: '#F8FAFD', borderBottom: '1px solid rgba(180,190,210,.18)',
    }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF6058' }} />
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
      {label && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: LC.muted, fontVariantNumeric: 'tabular-nums' }}>{label}</span>}
    </div>
    {children}
  </div>
);

/* ─── Tutorial icon set ─────────────────────────────────────────────────── */
const TutorialIcon = ({ id }) => {
  const icons = {
    'add-testing':           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v11.5a3.5 3.5 0 007 0V3M9 3h6M9 3H7M15 3h2M5 20h14" /></svg>,
    'compare-previous-test': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l4-8 4 5 3-3 4 6" /><path d="M3 12l4-5 4 4 3-4 4 5" strokeOpacity="0.4" /></svg>,
    'training-page':         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 10h16M4 14h10M4 18h7" /></svg>,
    'training-calendar':     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
    'dashboard-page':        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 13l4-4 4 4 4-6 4 3" /><path d="M3 20h18" /></svg>,
    'coach-add-athlete':     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
  };
  return icons[id] ?? null;
};

/* ─── Tutorial data ─────────────────────────────────────────────────────── */
const videoTutorials = [
  {
    id: 'add-testing',
    label: '1. Add a Lactate Test',
    title: 'How to enter a lactate test',
    description: 'Create a new test, select your sport, enter each stage — power/pace, heart rate and lactate — and save. The curve generates instantly.',
    steps: [
      'Go to Testing → New Test',
      'Select sport: bike, run, or swim',
      'Enter base lactate + each stage value',
      'Hit Save — curve generates instantly',
    ],
    videoSrc: '/videos/add-testing.mp4',
    tag: 'Getting started',
  },
  {
    id: 'compare-previous-test',
    label: '2. Compare Tests',
    title: 'Compare previous tests',
    description: 'Overlay multiple lactate tests on one chart to see how your fitness is evolving. Watch your curve shift right as you get fitter.',
    steps: [
      'Open a test result',
      'Select previous tests to overlay',
      'See how your curve shifted right',
      'Export a comparison PDF report',
    ],
    videoSrc: '/videos/compare-previous-test.mp4',
    tag: 'Analysis',
  },
  {
    id: 'training-page',
    label: '3. Training Log',
    title: 'Training log & workouts',
    description: 'Browse your full training history, analyse individual sessions with power and heart rate graphs, and track intervals automatically.',
    steps: [
      'Go to Training',
      'Click any session to open it',
      'Review power / HR / pace graph',
      'Check auto-detected intervals',
    ],
    videoSrc: '/videos/training-page.mp4',
    tag: 'Training',
  },
  {
    id: 'training-calendar',
    label: '4. Training Calendar',
    title: 'Training calendar',
    description: 'See your whole training week at a glance, plan future sessions and track daily load across the month.',
    steps: [
      'Go to Training Calendar',
      'Browse past & future sessions',
      'Click a day to see session details',
      'Monitor weekly training load',
    ],
    videoSrc: '/videos/training-calendar.mp4',
    tag: 'Training',
  },
  {
    id: 'dashboard-page',
    label: '5. Dashboard',
    title: 'Reading your fitness dashboard',
    description: 'Understand CTL, ATL and TSB — your fitness, fatigue and form — and use the chart to time your best performances.',
    steps: [
      'View CTL / ATL / TSB chart',
      'Hover to see daily values',
      'Connect Strava for auto-updates',
      'Plan races around peak form',
    ],
    videoSrc: '/videos/dashboard-page.mp4',
    tag: 'Analytics',
  },
  {
    id: 'coach-add-athlete',
    label: '6. Coach — Add Athlete',
    title: 'Add an athlete as a coach',
    description: 'Invite athletes to your coaching workspace, assign them a plan and monitor their training and lactate tests from one dashboard.',
    steps: [
      'Go to Athletes → Add Athlete',
      'Enter athlete email and send invite',
      'Athlete accepts and joins your workspace',
      'Monitor their tests and training log',
    ],
    videoSrc: '/videos/coach-add-athlete.mp4',
    tag: 'Coaching',
  },
];

/* ─── Inline video player with custom controls ─────────────────────────── */
function TutorialPlayer({ tutorial }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const progressRef = useRef(null);

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

  const seek = (e) => {
    const bar = progressRef.current;
    const v = videoRef.current;
    if (!bar || !v) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
  };

  return (
    <BrowserFrame label={`lachart.net — ${tutorial.title}`}>
      <div className="relative bg-black select-none" style={{ aspectRatio: '16/9' }}>
        <video
          ref={videoRef}
          src={tutorial.videoSrc}
          className="w-full h-full object-cover cursor-pointer"
          playsInline
          onClick={togglePlay}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
          onEnded={() => { setPlaying(false); setProgress(0); if (videoRef.current) videoRef.current.currentTime = 0; }}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25 cursor-pointer" onClick={togglePlay}>
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
              <svg className="w-7 h-7 ml-1" fill={LC.primaryDark} viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            </div>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-6" style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}>
          <div ref={progressRef} onClick={seek} className="w-full h-1.5 bg-white/30 rounded-full cursor-pointer mb-2">
            <div style={{ width: `${progress}%`, background: LC.primary }} className="h-full rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="text-white">
              {playing
                ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              }
            </button>
            <span className="text-white text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(currentTime)} / {fmt(duration)}
            </span>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function Tutorials() {
  const [activeId, setActiveId] = useState(videoTutorials[0].id);
  const active = videoTutorials.find(t => t.id === activeId) || videoTutorials[0];
  const activeIdx = videoTutorials.findIndex(t => t.id === activeId);

  const pageStyle = {
    fontFamily: "'Hind Vadodara', system-ui, -apple-system, sans-serif",
    color: LC.text,
    background: `radial-gradient(ellipse 40% 30% at 80% 0%, rgba(123,194,235,.18) 0%, transparent 70%),
                 radial-gradient(ellipse 50% 40% at 0% 30%, rgba(118,126,181,.16) 0%, transparent 70%),
                 linear-gradient(180deg, #FFFFFF 0%, #F8FAFD 100%)`,
    backgroundAttachment: 'fixed',
    minHeight: '100vh',
  };

  return (
    <>
      <Helmet>
        <title>LaChart Tutorials · Video walkthroughs for lactate testing</title>
        <meta name="description" content="Step-by-step video walkthroughs: enter a lactate test, compare previous tests, training log, calendar, dashboard form/fitness, coach + athlete." />
      </Helmet>

      <div style={pageStyle}>
        {/* Sticky nav (compact, matches About) */}
        <nav style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: 'rgba(255,255,255,.95)',
          backdropFilter: 'blur(20px) saturate(170%)',
          WebkitBackdropFilter: 'blur(20px) saturate(170%)',
          borderBottom: '1px solid rgba(180,190,210,.18)',
        }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontWeight: 700, color: LC.primaryDark, fontSize: 18, textDecoration: 'none' }}>
              <img src="/about-design/lachart-logo.png" alt="LaChart" style={{ height: 32 }} />
              <span>LaChart</span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to="/" style={{ color: LC.muted, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>← Back to home</Link>
              <Link to="/signup" style={{ padding: '10px 18px', borderRadius: 10, background: LC.primaryDark, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 12px -4px rgba(118,126,181,.5)' }}>
                Start free
              </Link>
            </div>
          </div>
        </nav>

        <section style={{ padding: '64px 24px 96px', maxWidth: 1280, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto 40px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontSize: 11, fontWeight: 700, color: LC.primaryDark,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              padding: '6px 12px', borderRadius: 9999,
              background: LC.primaryTint, border: '1px solid rgba(118,126,181,.20)',
            }}>
              <i style={{ width: 6, height: 6, borderRadius: '50%', background: LC.primary }} />
              Video tutorials
            </span>
            <h1 style={{ fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, color: LC.ink, margin: '20px 0 12px' }}>
              Learn LaChart <em style={{ fontStyle: 'normal', background: `linear-gradient(135deg, ${LC.primary}, ${LC.secondary})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>step by step</em>
            </h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: LC.muted, margin: '0 auto' }}>
              Short walkthroughs for every key workflow — from your first lactate test to reading the dashboard.
            </p>
          </div>

          {/* Tab strip */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
            {videoTutorials.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveId(t.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 18px', borderRadius: 9999,
                  border: activeId === t.id ? 'none' : '1px solid ' + LC.border,
                  background: activeId === t.id ? LC.primaryDark : '#fff',
                  color: activeId === t.id ? '#fff' : LC.muted,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  transition: 'all .25s cubic-bezier(.2,.7,.2,1)',
                  minHeight: 44,
                }}
              >
                <TutorialIcon id={t.id} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Active tutorial */}
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
              className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start"
            >
              <div className="lg:col-span-3">
                <TutorialPlayer tutorial={active} />
              </div>
              <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 9999, background: LC.primaryTint, color: LC.primaryDark, fontSize: 11.5, fontWeight: 700, marginBottom: 12, border: '1px solid ' + LC.border }}>
                    {active.tag}
                  </span>
                  <h3 style={{ fontSize: 24, fontWeight: 800, color: LC.ink, margin: '0 0 8px', letterSpacing: '-0.015em' }}>{active.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: LC.muted, margin: 0 }}>{active.description}</p>
                </div>

                <div style={{ background: '#F8FAFD', border: '1px solid ' + LC.border, borderRadius: 16, padding: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: LC.muted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>Steps in this tutorial</p>
                  <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {active.steps.map((step, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: LC.primary, color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                        <span style={{ fontSize: 13.5, color: LC.text, lineHeight: 1.5 }}>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Link to="/lactate-curve-calculator" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 22px', borderRadius: 12, background: LC.primaryDark, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, boxShadow: '0 8px 22px -6px rgba(118,126,181,.55)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Try it live
                  </Link>
                  <Link to="/signup" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '12px 22px', borderRadius: 12, background: 'transparent', color: LC.primaryDark, border: '1px solid ' + LC.border, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                    Create free account
                  </Link>
                </div>

                {/* Prev / Next */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
                  <button
                    onClick={() => { if (activeIdx > 0) setActiveId(videoTutorials[activeIdx - 1].id); }}
                    disabled={activeIdx === 0}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      border: 'none', background: 'transparent', color: LC.muted,
                      fontSize: 12, fontWeight: 600, cursor: activeIdx === 0 ? 'not-allowed' : 'pointer',
                      opacity: activeIdx === 0 ? 0.3 : 1,
                      padding: '6px 4px',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7" /></svg>
                    Previous
                  </button>
                  <span style={{ fontSize: 11, color: LC.muted, fontVariantNumeric: 'tabular-nums' }}>{activeIdx + 1} / {videoTutorials.length}</span>
                  <button
                    onClick={() => { if (activeIdx < videoTutorials.length - 1) setActiveId(videoTutorials[activeIdx + 1].id); }}
                    disabled={activeIdx === videoTutorials.length - 1}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      border: 'none', background: 'transparent', color: LC.muted,
                      fontSize: 12, fontWeight: 600, cursor: activeIdx === videoTutorials.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: activeIdx === videoTutorials.length - 1 ? 0.3 : 1,
                      padding: '6px 4px',
                    }}
                  >
                    Next
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </>
  );
}
