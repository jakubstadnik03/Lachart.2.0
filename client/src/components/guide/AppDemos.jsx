/**
 * "In the iPhone app" — short screen recordings of the native app, each in a
 * phone frame with what to look at beside it.
 *
 * The clips are real sessions recorded in the iOS simulator (client/public/
 * videos/app, 540 px wide, no audio, ~0.3 MB each). They play muted and
 * looping, and only while on screen, so a page of seven costs one decode at
 * a time and nothing at all until scrolled to.
 */
import React, { useEffect, useRef } from 'react';

const C = {
  ink: '#0F1729', text: '#1F2738', muted: '#6B7280', primary: '#767EB5', primaryDark: '#5E6590',
  tint: '#EEF0F8', border: 'rgba(180,190,210,.30)',
};

export const APP_DEMOS = [
  {
    id: 'home', audience: 'athlete', src: '/videos/app/app-home',
    title: 'Your day at a glance',
    lead: 'Home answers three questions: what to do today, how fresh you are, and what your zones are.',
    points: ['Swipe the top card for this week, sports and training load', 'Today\'s plan sits under the week strip', 'Form and zones follow below'],
  },
  {
    id: 'form', audience: 'athlete', src: '/videos/app/app-form',
    title: 'Reading form, fitness and zones',
    lead: 'Form is fitness minus fatigue. Positive means fresh, negative means you are carrying load.',
    points: ['Tap ⓘ for what each curve means', 'Form chart shows the last three months', 'Threshold trend shows LT1 and LT2 moving', '"Where you are now" estimates thresholds from your training'],
  },
  {
    id: 'testing', audience: 'athlete', src: '/videos/app/app-testing',
    title: 'Lactate tests and your curve',
    lead: 'Every test becomes a curve with LT1, LT2 and five training zones — in watts or pace, and heart rate.',
    points: ['LT2 trend across all your tests', 'The curve marks LT1 (green) and LT2 (red)', '"Since your test" reads your thresholds from training since the test'],
  },
  {
    id: 'plan', audience: 'athlete', src: '/videos/app/app-plan',
    title: 'Planning a workout',
    lead: 'Pick a day, a sport and a template. Targets come from your own thresholds.',
    points: ['Tap + on any day in the calendar', 'Choose a template — e.g. 5×8 min @LT2', 'The preview draws your LT1 and LT2 lines', 'Plan it, then push to Garmin, Zwift or TrainingPeaks'],
  },
  {
    id: 'training', audience: 'athlete', src: '/videos/app/app-training',
    title: 'Sessions you repeat, and whether you are improving',
    lead: 'LaChart groups the same session automatically and tells you if you are getting faster at it.',
    points: ['Filter by sport', 'Open a group for the trend and every session', 'Open a session for laps, TSS and lactate', 'Pull down to close'],
  },
  {
    id: 'compare', audience: 'athlete', src: '/videos/app/app-compare',
    title: 'Comparing every LT2 session',
    lead: 'Pick a category and every session in it is compared together, whatever it was called.',
    points: ['Tap a category such as LT2', 'One trend per sport', 'Tap a point in the chart to jump to that session'],
  },
  {
    id: 'search', audience: 'athlete', src: '/videos/app/app-search',
    title: 'Finding any session',
    lead: 'Search by name, sport or month — in English or Czech, with or without accents.',
    points: ['Results split into groups and single sessions', 'Newest first', 'Tap to open the session'],
  },
  {
    id: 'coach-roster', audience: 'coach', src: '/videos/app/app-coach-roster',
    title: 'Your athletes, one tap apart',
    lead: 'Every athlete you coach in one list — and in the bar at the top of every screen.',
    points: ['Open an athlete for their zones from the last test', 'Switch athletes from the bar at the top', 'Home, calendar and training follow whoever is selected'],
  },
  {
    id: 'coach-calendar', audience: 'coach', src: '/videos/app/app-coach-calendar',
    title: "An athlete's calendar and charts",
    lead: 'Pick an athlete and their month opens: every session against its plan, then the charts behind it.',
    points: ['Each day shows the session and whether it hit the target', 'Charts: totals, form & fitness over 2 months to 2 years', 'Sport split, intensity distribution and daily load'],
  },
  {
    id: 'coach-testing', audience: 'coach', src: '/videos/app/app-coach-testing',
    title: 'Lactate tests for your athletes',
    lead: "Enter a test straight into the athlete's account. Their zones update from it.",
    points: ['Select the athlete, then + New', 'Stage by stage: power or pace, heart rate, lactate', 'The curve, LT1, LT2 and zones appear as you type', 'Every past test and the LT2 trend in one place'],
  },
  {
    id: 'coach-training', audience: 'coach', src: '/videos/app/app-coach-training',
    title: 'Is the athlete getting better?',
    lead: "Compare every session of one kind — all of an athlete's LT2 rides, whatever they were called.",
    points: ['Pick a category such as LT2', 'One trend per sport, with heart rate', 'Tap a point to find the session', 'Open it for laps, TSS and lactate'],
  },
  {
    id: 'coach-plan', audience: 'coach', src: '/videos/app/app-coach-plan',
    title: 'Planning for an athlete',
    lead: 'Pick the athlete, pick the day, drop in a session. Targets come from their thresholds, not yours.',
    points: ['Select the athlete in the top bar', 'Tap + Plan on the day', 'Choose a template — e.g. 2×20 min @LT2', 'It lands in their calendar and on their watch'],
  },
];

function PhoneVideo({ src, title }) {
  const ref = useRef(null);
  // Play while on screen, pause when not — straight from the observer, so a
  // clip that is already in view when the page lands (a #link) starts too.
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    const play = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    if (typeof IntersectionObserver === 'undefined') { play(); return undefined; }
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : v.pause()), { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div style={{
      width: 270, maxWidth: '78vw', flexShrink: 0, borderRadius: 44, padding: 10,
      background: '#0F1729', boxShadow: '0 30px 60px -20px rgba(15,23,41,.35), inset 0 0 0 2px #2A3147',
    }}>
      <video
        ref={ref}
        src={`${src}.mp4`}
        poster={`${src}.jpg`}
        muted
        loop
        playsInline
        preload="none"
        aria-label={title}
        style={{ display: 'block', width: '100%', aspectRatio: '1206 / 2622', borderRadius: 34, background: '#EEF0F4', objectFit: 'cover' }}
      />
    </div>
  );
}

export default function AppDemos({ demos = APP_DEMOS }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 72 }}>
      {demos.map((d, i) => (
        <article key={d.id} id={`app-${d.id}`} style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 40,
          flexDirection: i % 2 ? 'row-reverse' : 'row',
        }}>
          <PhoneVideo src={d.src} title={d.title} />
          <div style={{ flex: '1 1 320px', maxWidth: 460 }}>
            <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 9999, background: C.tint, color: C.primaryDark, fontSize: 11.5, fontWeight: 700, border: `1px solid ${C.border}` }}>
              {d.audience === 'coach' ? 'For coaches' : 'For athletes'}
            </span>
            <h3 style={{ fontSize: 26, fontWeight: 800, color: C.ink, margin: '12px 0 8px', letterSpacing: '-0.015em', lineHeight: 1.2 }}>{d.title}</h3>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: C.muted, margin: '0 0 16px' }}>{d.lead}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.points.map((p) => (
                <li key={p} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.text, lineHeight: 1.5 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 3, background: C.primary, marginTop: 8 }} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
