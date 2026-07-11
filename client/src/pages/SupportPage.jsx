import React, { useState, useEffect } from 'react';
import {
  ChevronDownIcon, ChevronUpIcon,
  EnvelopeIcon, BookOpenIcon, RocketLaunchIcon,
  BeakerIcon, ChartBarIcon, ArrowPathIcon,
  UserGroupIcon, CreditCardIcon, WrenchScrewdriverIcon,
  QuestionMarkCircleIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { isCapacitorNative } from '../utils/isNativeApp';
import { ATHLETE_PLAN_PRICE_LABEL, COACH_PLAN_PRICE_LABEL } from '../constants/planPricing';

/* ── FAQ accordion item ─────────────────────────────────────────────────────── */
const FAQItem = ({ question, answer, isOpen, onClick }) => (
  <div className={`border border-gray-200 rounded-xl overflow-hidden transition-all ${isOpen ? 'shadow-sm' : ''}`}>
    <button
      className="w-full flex justify-between items-center px-5 py-4 text-left bg-white hover:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      <span className="font-medium text-gray-900 pr-4 text-sm sm:text-base">{question}</span>
      {isOpen
        ? <ChevronUpIcon className="w-4 h-4 text-primary flex-shrink-0" />
        : <ChevronDownIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />}
    </button>
    {isOpen && (
      <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed border-t border-gray-100 bg-white">
        <div className="pt-4">{answer}</div>
      </div>
    )}
  </div>
);

/* ── Quick-help card ─────────────────────────────────────────────────────────── */
const HelpCard = ({ icon: Icon, title, description, color, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-start gap-3 p-5 bg-white rounded-2xl border border-gray-200 hover:border-primary/40 hover:shadow-md transition-all text-left group"
  >
    <div className={`p-2.5 rounded-xl ${color}`}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="font-semibold text-gray-900 text-sm group-hover:text-primary transition-colors">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
    </div>
  </button>
);

/* ── Main component ──────────────────────────────────────────────────────────── */
const SupportPage = () => {
  const [openQuestions, setOpenQuestions] = useState(new Set([0]));
  const [activeCategory, setActiveCategory] = useState('getting-started');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const toggleQuestion = (index) => {
    const next = new Set(openQuestions);
    next.has(index) ? next.delete(index) : next.add(index);
    setOpenQuestions(next);
  };

  /* ── FAQ content ──
   *
   * App Store Review 3.1.1 requires NO mention of paid digital content on
   * iOS unless it's purchasable via Apple In-App Purchase. LaChart's web
   * has subscription tiers, but the iOS shell intentionally hides every
   * paid surface (UpgradeModal returns null on native, the Settings
   * Subscription tab is excluded). The "Plans & Pricing" FAQ category
   * below mentioned €6.99 / €14.99 / 30-day trial which an iOS reviewer
   * could navigate to — that's what caused submission 6d7103fa rejection.
   * Skipping the whole category (including the FAQ items it contained)
   * when running inside Capacitor keeps the iOS build paid-content-free.
   */
  const onNativeIos = isCapacitorNative();
  const faqCategories = [
    {
      id: 'getting-started',
      label: 'Getting Started',
      icon: RocketLaunchIcon,
      items: [
        {
          question: "What is LaChart?",
          answer: (
            <div className="space-y-2">
              <p>LaChart is a comprehensive platform for endurance athletes and coaches focused on <strong>lactate threshold testing and analysis</strong>. It provides tools for:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Generating lactate curves from your test data</li>
                <li>Calculating training zones — LT1, LT2, LTP1, LTP2, OBLA, IAT, Log-log and more</li>
                <li>Tracking progress across tests over time</li>
                <li>Analyzing training data imported from Strava and FIT files</li>
                <li>Comparing workouts side-by-side to see real improvement</li>
              </ul>
              <p className="text-gray-500 text-xs mt-2">A Free plan is available. Pro and Coach plans unlock advanced features.</p>
            </div>
          ),
        },
        {
          question: "How do I set up my account?",
          answer: (
            <div className="space-y-2">
              <p>Getting started takes under 2 minutes:</p>
              <ol className="list-decimal pl-5 space-y-1 text-gray-600">
                <li>Sign up with email, Google, or Strava</li>
                <li>Choose your role — <strong>Athlete</strong> or <strong>Coach</strong></li>
                <li>Go to <strong>Settings → Profile</strong> to fill in your info</li>
                <li>Optionally connect Strava or upload a FIT file to import training data</li>
                <li>Create your first lactate test or log a workout from the dashboard</li>
              </ol>
            </div>
          ),
        },
        {
          question: "What sports are supported?",
          answer: "LaChart fully supports running, cycling, and swimming — covering all core endurance disciplines. Power, pace, heart rate, cadence, and lactate values can be recorded for any of these sports. Additional sports can be logged in the training calendar.",
        },
        {
          question: "Can I use LaChart without a subscription?",
          answer: "Yes — the Free plan gives you access to core lactate testing and curve generation, limited to 5 tests per month. You can also use the public Lactate Calculator without any account at all. Upgrading to Athlete unlocks unlimited tests, PDF export, advanced analytics, and priority support.",
        },
      ],
    },
    {
      id: 'lactate',
      label: 'Lactate Testing',
      icon: BeakerIcon,
      items: [
        {
          question: "How do I perform a lactate test in LaChart?",
          answer: (
            <div className="space-y-2">
              <p>Navigate to <strong>Lactate Tests → New Test</strong> and enter your test steps:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li><strong>Power / Pace</strong> — intensity at each step</li>
                <li><strong>Heart rate</strong> — average HR at that step</li>
                <li><strong>Lactate</strong> — blood lactate value (mmol/L)</li>
              </ul>
              <p>LaChart automatically fits the curve and calculates all threshold markers. You can then export the result as a PDF or compare it with previous tests.</p>
            </div>
          ),
        },
        {
          question: "Which threshold methods does LaChart calculate?",
          answer: (
            <div className="space-y-2">
              <p>LaChart calculates a full suite of lactate thresholds from your data:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-1">
                {[
                  ["LT1 & LT2", "First and second lactate thresholds"],
                  ["LTP1 & LTP2", "Lactate turning points (power/pace at thresholds)"],
                  ["OBLA 2.0 – 3.5", "Onset of blood lactate accumulation"],
                  ["IAT", "Individual Anaerobic Threshold"],
                  ["Log-log", "Mathematical precision threshold"],
                  ["Bsln +0.5 / +1.0 / +1.5", "Resting-lactate-based thresholds"],
                ].map(([term, def]) => (
                  <div key={term} className="flex gap-2 items-start py-0.5">
                    <CheckCircleIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span><strong className="text-gray-800">{term}</strong> — {def}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          question: "How are training zones calculated?",
          answer: "LaChart automatically calculates 5 training zones (Active Recovery, Endurance, Tempo, Lactate Threshold, VO2 Max) from your LT1 and LT2 thresholds. Zones are sport-specific and update automatically every time you complete a new lactate test. You can view them in your Profile and reference them throughout the training log.",
        },
        {
          question: "Can I compare tests over time?",
          answer: "Yes — the Test History view lets you overlay multiple lactate curves on one chart. You can see how your threshold power/pace has shifted and track fitness progression. The dashboard Training History widget also shows per-workout interval trends across repeated sessions.",
        },
      ],
    },
    {
      id: 'training',
      label: 'Training Log',
      icon: ChartBarIcon,
      items: [
        {
          question: "How does the training log work?",
          answer: (
            <div className="space-y-2">
              <p>The Training Calendar shows all your workouts — imported from Strava, uploaded as FIT files, or entered manually. Each session displays:</p>
              <ul className="list-disc pl-5 space-y-1 text-gray-600">
                <li>Interval breakdown with power, pace, heart rate, and lactate per lap</li>
                <li>Auto-detected interval types (warm-up, work, recovery, cool-down)</li>
                <li>TSS (Training Stress Score), distance, duration</li>
                <li>Comparison to the same workout done previously</li>
              </ul>
            </div>
          ),
        },
        {
          question: "How do I attach lactate values to training intervals?",
          answer: "Open any training session and click on an interval. You can manually enter a lactate value that was measured during that rep. LaChart will then color-code that interval on the chart and include it in comparisons. This lets you track lactate at a specific pace or power across multiple sessions.",
        },
        {
          question: "What does the Training History widget show?",
          answer: "The Training History widget on the dashboard groups sessions by workout title. It shows a bar chart where each column is one session and each bar within it is one interval — colored by intensity. The Progress section below compares your most recent two sessions of that type side-by-side (avg power or pace, improvement arrow).",
        },
        {
          question: "How does interval auto-detection work?",
          answer: "When you open a training session from a FIT file or Strava, LaChart automatically classifies each interval as warm-up, work, recovery, or cool-down based on distance, duration, and intensity relative to the session average. You can also manually override these labels — or disable auto-detection entirely using the toggle in the training form.",
        },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      icon: ArrowPathIcon,
      items: [
        {
          question: "How do I connect Strava?",
          answer: "Go to Settings → Integrations and click Connect Strava. You'll be redirected to Strava's authorization page. Once authorized, LaChart will import your recent activities. Enable Auto-sync to automatically pull new activities as you complete them. You can also update your profile picture from Strava.",
        },
        {
          question: "How do I upload a FIT file?",
          answer: "You can upload a .fit file directly from Settings → Integrations or from the Training Calendar using the Upload button. LaChart parses lap data, calculates interval metrics, and makes the session available in your log. FIT files from Garmin, Wahoo, Polar, Coros, and most other devices are supported.",
        },
        {
          question: "Does Strava auto-sync work in real time?",
          answer: "Yes — when Auto-sync is enabled, LaChart registers a Strava webhook. Each time you upload an activity to Strava, it's automatically synced to LaChart within a few minutes. No manual import needed.",
        },
        {
          question: "Is Garmin Connect supported?",
          answer: "Garmin Connect integration is available in Settings → Integrations. Once connected, activities sync automatically similar to Strava. You can enable or disable Garmin Auto-sync independently from Strava.",
        },
      ],
    },
    {
      id: 'coaches',
      label: 'Coaches',
      icon: UserGroupIcon,
      items: [
        {
          question: "How does the Coach plan work?",
          answer: "Coach accounts get a dedicated dashboard where you can manage multiple athletes. You can view each athlete's lactate test history, training calendar, workout comparisons, and zone data — all in one place. Switch between athletes from the sidebar. Athletes receive an email invitation and must accept before you can view their data.",
        },
        {
          question: "How do I add an athlete?",
          answer: "Go to Settings → Coach and enter your athlete's email address. They'll receive an invitation email. Once they accept, their data becomes visible on your coach dashboard. Athletes can also invite you directly from their Settings → Profile page.",
        },
        {
          question: "Can athletes see their coach's data?",
          answer: "No — the coach–athlete relationship is one-directional. Coaches can view athlete data, but athletes cannot see the coach's personal training or tests. An athlete can have multiple coaches, and each coach only sees data the athlete has made available.",
        },
      ],
    },
    // ── Plans & Pricing ─────────────────────────────────────────────
    // Excluded entirely on native iOS (Capacitor) so the App Store
    // build contains zero references to paid digital content. The web
    // build keeps the category since it's billed through Stripe outside
    // Apple's IAP, which is permitted.
    ...(onNativeIos ? [] : [{
      id: 'pricing',
      label: 'Plans & Pricing',
      icon: CreditCardIcon,
      items: [
        {
          question: "What are the available plans?",
          answer: (
            <div className="space-y-3">
              {[
                { name: "Free", price: "€0", features: ["Up to 5 lactate tests/month", "Basic training log", "Strava sync (manual)", "Public lactate calculator"] },
                { name: "Athlete", price: `${ATHLETE_PLAN_PRICE_LABEL}/mo`, features: ["Unlimited lactate tests", "PDF export", "Advanced analytics", "FIT file upload", "Auto-sync (Strava & Garmin)", "Priority support"] },
                { name: "Coach", price: `${COACH_PLAN_PRICE_LABEL}/mo`, features: ["Everything in Athlete", "Coach dashboard", "Up to 10 athletes", "Athlete progress tracking"] },
              ].map(plan => (
                <div key={plan.name} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="font-semibold text-gray-900">{plan.name}</span>
                    <span className="text-sm font-medium text-primary">{plan.price}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                        <CheckCircleIcon className="w-3.5 h-3.5 text-green-500 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ),
        },
        {
          question: "Is there a free trial for paid plans?",
          answer: "Yes — every paid plan includes a 60-day (2 months) free trial. You won't be charged until the trial ends, and you can cancel anytime before that at no cost. After the trial, billing starts automatically. You can manage your subscription in Settings → Subscription.",
        },
        {
          question: "How do I cancel or change my plan?",
          answer: "Go to Settings → Subscription. From there you can upgrade, downgrade, or cancel your plan at any time. Cancellations take effect at the end of your current billing period — you keep access to paid features until then.",
        },
      ],
    }]),
  ];

  const activeCat = faqCategories.find(c => c.id === activeCategory);

  const quickLinks = [
    { icon: RocketLaunchIcon, title: "Getting Started", description: "Set up your account and first test", color: "bg-violet-50 text-violet-600", cat: "getting-started" },
    { icon: BeakerIcon, title: "Lactate Tests", description: "How to run and interpret tests", color: "bg-amber-50 text-amber-600", cat: "lactate" },
    { icon: ChartBarIcon, title: "Training Log", description: "Import and analyze workouts", color: "bg-sky-50 text-sky-600", cat: "training" },
    { icon: ArrowPathIcon, title: "Integrations", description: "Strava, Garmin & FIT files", color: "bg-green-50 text-green-600", cat: "integrations" },
    { icon: UserGroupIcon, title: "For Coaches", description: "Manage athletes & dashboards", color: "bg-rose-50 text-rose-600", cat: "coaches" },
    // Plans & Pricing tile hidden on iOS — see faqCategories comment above.
    ...(onNativeIos ? [] : [{ icon: CreditCardIcon, title: "Plans & Pricing", description: "Free, Pro and Coach plans", color: "bg-indigo-50 text-indigo-600", cat: "pricing" }]),
  ];

  return (
    <div className={`${isMobile ? 'm-1 rounded-xl' : 'm-5 rounded-3xl'} bg-white border border-gray-100 shadow-sm overflow-hidden`}
         style={isMobile ? {} : { height: 'calc(100vh - 190px)' }}>
      <div className="h-full overflow-y-auto">

        {/* ── Hero ── */}
        <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 px-6 sm:px-10 py-10 sm:py-14 text-white">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/15 rounded-full px-3 py-1 text-xs font-medium mb-4">
              <QuestionMarkCircleIcon className="w-3.5 h-3.5" />
              Help Center
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold mb-3 leading-tight">
              How can we help you?
            </h1>
            <p className="text-white/80 text-sm sm:text-base max-w-xl leading-relaxed">
              Find answers to common questions about lactate testing, training analysis, integrations, and your account. Can't find what you need? Contact us directly.
            </p>
            <a
              href="mailto:lachart@lachart.net"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-white text-primary font-semibold rounded-xl text-sm hover:bg-gray-50 transition-colors shadow-lg shadow-black/10"
            >
              <EnvelopeIcon className="w-4 h-4" />
              Email support
            </a>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10">

          {/* ── Quick links ── */}
          <div className="mb-10">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Browse by topic</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickLinks.map(q => (
                <HelpCard
                  key={q.cat}
                  icon={q.icon}
                  title={q.title}
                  description={q.description}
                  color={q.color}
                  onClick={() => { setActiveCategory(q.cat); setOpenQuestions(new Set([0])); }}
                />
              ))}
            </div>
          </div>

          {/* ── FAQ ── */}
          <div className="flex flex-col sm:flex-row gap-8">

            {/* Sidebar nav */}
            <aside className="sm:w-52 shrink-0">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Categories</h2>
              <nav className="flex flex-row flex-wrap sm:flex-col gap-1">
                {faqCategories.map(cat => {
                  const Icon = cat.icon;
                  const active = cat.id === activeCategory;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => { setActiveCategory(cat.id); setOpenQuestions(new Set([0])); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left ${
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-primary' : 'text-gray-400'}`} />
                      <span className="truncate">{cat.label}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* FAQ items */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-5">
                {activeCat && <activeCat.icon className="w-5 h-5 text-primary" />}
                <h2 className="text-lg font-bold text-gray-900">{activeCat?.label}</h2>
                <span className="ml-auto text-xs text-gray-400">{activeCat?.items.length} questions</span>
              </div>
              <div className="space-y-3">
                {activeCat?.items.map((faq, index) => (
                  <FAQItem
                    key={index}
                    question={faq.question}
                    answer={faq.answer}
                    isOpen={openQuestions.has(index)}
                    onClick={() => toggleQuestion(index)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Contact banner ── */}
          <div className="mt-12 rounded-2xl bg-gray-50 border border-gray-200 p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-white border border-gray-200 shadow-sm shrink-0">
                <WrenchScrewdriverIcon className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Still need help?</h3>
                <p className="text-sm text-gray-500 mt-0.5">Our team usually responds within 24 hours on business days.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="mailto:lachart@lachart.net"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-primary/90 transition-colors shadow-sm"
              >
                <EnvelopeIcon className="w-4 h-4" />
                Contact support
              </a>
              <a
                href="https://lachart.net"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 font-semibold rounded-xl text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <BookOpenIcon className="w-4 h-4" />
                Visit website
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SupportPage;
