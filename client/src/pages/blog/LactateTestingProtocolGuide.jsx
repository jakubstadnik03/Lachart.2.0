import React from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import BlogPostLayout from './BlogPostLayout';

const LactateTestingProtocolGuide = () => (
  <BlogPostLayout
    slug="lactate-testing-protocol-guide"
    title="The Complete Blood Lactate Testing Protocol: Step-by-Step Guide for Athletes and Coaches"
    subtitle="A bad protocol produces useless data, no matter how good your analyser. This guide covers everything you need to run a valid, reproducible lactate threshold test — from 48-hour pre-test preparation to post-test data entry in LaChart."
    category="Testing Protocol"
    date="2025-01-15"
    readTime="10 min"
    image="/images/lactate_testing.png"
    imageAlt="Blood lactate testing equipment including analyser, lancets and test strips for LT1 LT2 measurement"
    description="Complete step-by-step blood lactate testing protocol for cyclists, runners, and triathletes. Learn warm-up duration, step length, blood sampling technique, and how to avoid common errors."
    keywords="blood lactate test protocol, lactate threshold test, LT1 test, LT2 test, how to do lactate test, cycling lactate test, running lactate test, lactate testing guide"
    relatedSlugs={['how-lachart-calculates-lt1-lt2', 'obla-dmax-iat-methods-compared']}
  >

    {/* Quick reference card */}
    <div className="not-prose bg-gray-50 rounded-2xl border border-gray-200 p-6 my-8">
      <h3 className="text-base font-bold text-gray-900 mb-4">Quick Protocol Reference</h3>
      <div className="grid sm:grid-cols-2 gap-2">
        {[
          ['Pre-test',        '48h no hard training, no alcohol'],
          ['Warm-up',         '15–20 min at easy effort (RPE 2–3)'],
          ['Step duration',   '3–5 min (4 min is standard)'],
          ['Step intensity',  '+20–30 W or +0.5 km/h per step'],
          ['Blood sample',    'Fingertip, end of each step'],
          ['Sample size',     '~3 mm diameter droplet (0.7 µL)'],
          ['Stop test',       'Lactate > 7–8 mmol/L or exhaustion'],
          ['Minimum steps',   '6 steps for reliable threshold detection'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-0 text-sm">
            <span className="text-gray-500 font-medium">{k}</span>
            <span className="font-bold text-primary text-right ml-4">{v}</span>
          </div>
        ))}
      </div>
    </div>

    <h2>Why Protocol Standardisation Matters</h2>
    <p>
      Blood lactate concentration is not a fixed physiological property — it is dynamic, context-dependent, and
      exquisitely sensitive to the conditions of measurement. Two tests on the same athlete, run one week apart with
      slightly different warm-ups, can produce LT2 values that differ by 30–40 W. This is not measurement error; it
      is real physiological variation caused by protocol inconsistency.
    </p>
    <p>
      Standardisation serves two purposes: (1) making the test result <em>meaningful</em> in absolute terms, and (2)
      making it <em>comparable</em> across time — so you can actually track training adaptations.
    </p>

    <h2>48–72 Hours Before the Test</h2>
    <div className="not-prose space-y-3 my-6">
      {[
        ['No high-intensity training', 'Hard sessions cause residual lactate elevation for 24–36 hours. A Zone 4 workout the day before will artificially depress your apparent threshold.'],
        ['No alcohol',                 'Alcohol alters hepatic lactate clearance and elevates resting lactate for up to 24 hours.'],
        ['Normal carbohydrate intake', 'Low-carb states shift the lactate curve leftward — you appear to threshold at lower power, misleading your zone calculation.'],
        ['Normal sleep',               'Sleep deprivation elevates baseline lactate by 0.3–0.6 mmol/L on average.'],
        ['Same time of day',           'If you always test at 9 am, always test at 9 am. Diurnal variation affects lactate by up to 15%.'],
      ].map(([title, desc]) => (
        <div key={title} className="flex gap-3 items-start py-3 border-b border-gray-100">
          <CheckCircleIcon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <strong className="text-gray-900 text-sm font-semibold">{title}</strong>
            <p className="text-gray-600 text-sm mt-0.5 mb-0">{desc}</p>
          </div>
        </div>
      ))}
    </div>

    <h2>Equipment Checklist</h2>
    <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
      {[
        { title: 'Lactate analyser',    desc: 'Lactate Plus, Lactate Scout, or lab-grade analyser. Calibrate before each session.' },
        { title: 'Test strips',         desc: 'Use strips from the same batch throughout a test series. Batch variation can cause systematic error.' },
        { title: 'Lancets',             desc: 'Use a fatter-gauge lancet for a larger drop. Thin, watery blood indicates sweat contamination.' },
        { title: 'Alcohol wipes',       desc: 'Wipe, then let the finger dry completely before lancing. Wet alcohol dilutes the sample.' },
        { title: 'Power meter / GPS',   desc: 'For cycling, a calibrated power meter is non-negotiable. Heart rate alone cannot define stages reliably.' },
        { title: 'Timer',               desc: 'Stage end must be precise. Late sampling (>30 sec after step end) allows lactate to clear, lowering values.' },
      ].map(({ title, desc }) => (
        <div key={title} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h4 className="font-bold text-gray-900 text-sm mb-1">{title}</h4>
          <p className="text-gray-600 text-sm mb-0">{desc}</p>
        </div>
      ))}
    </div>

    <h2>Step 1: Warm-Up (15–20 Minutes)</h2>
    <p>
      The warm-up serves two physiological purposes: elevating core temperature to ensure enzyme kinetics are stable,
      and flushing resting lactate toward a physiological baseline (not zero — the body always produces some lactate
      at rest).
    </p>
    <p>
      Target effort: RPE 2–3 (easy conversation pace). Heart rate should not exceed approximately 65% of max HR.
      For cyclists, 100–130 W is typical for well-trained athletes; for runners, about 60% of 10 K race pace.
    </p>
    <p>
      Take an <strong>optional resting sample</strong> before warm-up if you want to document baseline. Normal
      resting lactate is 0.8–1.2 mmol/L. Values above 1.5 mmol/L at rest suggest incomplete recovery from
      previous training.
    </p>

    <h2>Step 2: Running the Incremental Test</h2>
    <div className="not-prose space-y-6 my-6">
      {[
        {
          num: '01',
          title: 'Set your starting intensity',
          content: 'Begin well below your expected LT1. For cyclists: approximately 40–50% of FTP (or known LT2). For runners: about 2–3 min/km slower than threshold pace. You want your first 2–3 stages to be fully aerobic with lactate in the 1.0–1.8 mmol/L range.',
        },
        {
          num: '02',
          title: 'Hold each step for exactly 4 minutes',
          content: 'Four minutes is the standard — long enough for lactate to stabilise at steady state, short enough to complete the full curve before fatigue compromises later steps. Some laboratories use 3-minute steps for very high-intensity testing; 5-minute steps may be needed for sedentary populations.',
        },
        {
          num: '03',
          title: 'Take blood at the last 30 seconds of each step',
          content: 'Sample timing is critical. Lactate is highest at the end of a step and begins clearing as soon as intensity drops. Sample from the fingertip. Lance, wipe away the first drop (contains interstitial fluid), then collect the second drop directly onto the strip.',
        },
        {
          num: '04',
          title: 'Increase by consistent increments',
          content: 'Cycling: 20–30 W per step. Running: 0.5 km/h or 10 sec/km per step. Swimming: 25 m per 100 m split. Consistent increments are important for D-max and polynomial fitting — irregular steps introduce fitting errors.',
        },
        {
          num: '05',
          title: 'Continue until lactate clearly exceeds LT2',
          content: 'You need at least 2–3 data points above LT2 for the algorithm to accurately locate the threshold. Stop when lactate exceeds 7–8 mmol/L or the athlete reaches volitional exhaustion. Aim for 8–12 total steps.',
        },
      ].map(({ num, title, content }) => (
        <div key={num} className="flex gap-5">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
            {num}
          </div>
          <div>
            <h3 className="font-bold text-gray-900 mt-0 mb-1 text-base">{title}</h3>
            <p className="text-gray-700 mb-0 text-sm leading-relaxed">{content}</p>
          </div>
        </div>
      ))}
    </div>

    <h2>Common Errors and How to Avoid Them</h2>
    <div className="not-prose space-y-4 my-6">
      {[
        {
          error: 'Thin, watery blood drop',
          cause: 'Sweat contamination or over-hydration',
          fix: 'Wipe finger dry completely. Use alcohol wipe then wait 15 seconds. Take second drop, not first.',
        },
        {
          error: 'Lactate spikes then drops (saw-tooth pattern)',
          cause: 'Inconsistent sampling timing or strip batch variation',
          fix: "Always sample at the same point in each step. Use strips from one batch. LaChart's outlier filter will catch isolated spikes.",
        },
        {
          error: 'First sample already >2.5 mmol/L',
          cause: 'Starting intensity too high or incomplete warm-up',
          fix: 'Lower starting power. You need sub-threshold data for accurate curve fitting.',
        },
        {
          error: 'Flat curve — lactate barely rises',
          cause: 'Step increments too small, or test too short',
          fix: 'Increase step size. Extend test until you reach 5+ mmol/L or exhaustion.',
        },
        {
          error: 'No heart rate data recorded',
          cause: 'HR monitor not worn or not recorded',
          fix: 'Always record HR. LaChart uses it to interpolate HR at thresholds and generate HR-based training zones.',
        },
      ].map(({ error, cause, fix }) => (
        <div key={error} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 bg-red-50 px-4 py-3 border-b border-gray-200">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="font-bold text-red-700 text-sm">{error}</span>
          </div>
          <div className="px-4 py-3 grid sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400 uppercase text-xs tracking-wide">Cause</span>
              <p className="text-gray-700 mt-1 mb-0">{cause}</p>
            </div>
            <div>
              <span className="text-primary uppercase text-xs tracking-wide font-medium">Fix</span>
              <p className="text-gray-700 mt-1 mb-0">{fix}</p>
            </div>
          </div>
        </div>
      ))}
    </div>

    <h2>Step 3: Enter Data into LaChart</h2>
    <p>
      After the test, open LaChart's testing page and enter each step as a row in the data table:
    </p>
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>What to enter</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Power (W) / Pace', 'Average for the step',           'Use lap average, not last-second value'],
            ['Lactate (mmol/L)', 'Analyser reading',               'Enter to 1 decimal (e.g. 1.8)'],
            ['Heart Rate (bpm)', 'Average for last 60 sec of step','Or use step average'],
            ['Duration (min)',   '4 (or your step length)',        'Must be consistent across steps'],
          ].map(([f, w, n]) => (
            <tr key={f}>
              <td><strong>{f}</strong></td>
              <td>{w}</td>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p>
      LaChart will immediately calculate the lactate curve, display LT1 and LT2 markers from all 8 methods, and
      generate your training zones. You can also download a professional PDF report to share with your coach.
    </p>

  </BlogPostLayout>
);

export default LactateTestingProtocolGuide;
