/**
 * Everything LaChart can do, in one browsable list.
 *
 * The app grew faster than anyone's memory of it: lactate curves, a block
 * planner, live workouts, three device integrations, race tapering. Nothing
 * tells a new athlete that any of it exists — features are found by wandering
 * into the right tab.
 *
 * The What's New modal already describes fifteen of them, well, once, on
 * release day. This turns that same copy into a permanent catalogue and adds
 * what the modal never covered, so the answer to "what can I do here" is a
 * screen rather than a support email.
 *
 * Source of truth stays WHATS_NEW_SLIDES — an entry described in both places
 * is written once.
 */
import {
  BeakerIcon,
  BellAlertIcon,
  CalculatorIcon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  ChartPieIcon,
  ClockIcon,
  CloudIcon,
  CpuChipIcon,
  HeartIcon,
  MapIcon,
  MoonIcon,
  RectangleStackIcon,
  ShareIcon,
  SparklesIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { WHATS_NEW_SLIDES } from './whatsNewSlides';

/** Ordered — this is the order they appear on the guide page. */
export const GUIDE_SECTIONS = [
  {
    id: 'start',
    title: 'Get your training in',
    blurb: 'Connect a device once; everything after this happens on its own.',
  },
  {
    id: 'train',
    title: 'Understand a session',
    blurb: 'What actually happened in a workout, beyond the totals.',
  },
  {
    id: 'test',
    title: 'Test and set your zones',
    blurb: 'Your own physiology instead of a formula from your age.',
  },
  {
    id: 'plan',
    title: 'Plan what comes next',
    blurb: 'From a single interval session to a whole season.',
  },
  {
    id: 'coach',
    title: 'Coach other people',
    blurb: 'Your squad, your branding.',
  },
  {
    id: 'anywhere',
    title: 'Take it with you',
    blurb: 'The phone, the watch, and how you feel.',
  },
];

/** Which section each What's New slide belongs to. */
const SECTION_BY_SLIDE = {
  'strava-connect': 'start',
  'import-categorize': 'start',
  'analyze-workout': 'train',
  'power-profile': 'train',
  'compare-tests': 'train',
  'lactate-curve': 'test',
  'training-zones': 'test',
  'lactate-interval': 'test',
  'pdf-branding': 'coach',
  'plan-workout': 'plan',
  'race-planning': 'plan',
  'form-fitness': 'plan',
  'live-workout': 'train',
  'coach-squad': 'coach',
  'ios-app': 'anywhere',
};

/**
 * Features the release slides never covered. Each one is a screen that exists
 * today — if a feature is removed, its entry goes with it.
 */
const EXTRA_ENTRIES = [
  {
    id: 'garmin-apple-health',
    section: 'start',
    icon: HeartIcon,
    label: 'Integrations',
    title: 'Garmin and Apple Health too',
    body: 'Strava is not the only way in. Connect Garmin or Apple Health and see, workout by workout, which ones already landed in LaChart — anything missing imports with one tap.',
    bullets: [
      'A 90-day list with imported / not imported per workout',
      'Retro-import a single session that slipped through',
      'Sleep, resting HR and HRV from Apple Health',
    ],
    cta: 'Open integrations',
    href: '/settings?tab=integrations',
    accent: '#e11d48',
  },
  {
    id: 'block-builder',
    section: 'plan',
    icon: ChartPieIcon,
    title: 'Build a whole training block',
    body: 'Answer a few questions about your week — sports, hours, how much you run and swim — and LaChart lays out six weeks of sessions, recovery weeks included, with the intervals already written.',
    label: 'Planner',
    bullets: [
      'Swim, bike and run planned together',
      'See the fitness and form the block would produce',
      'Add it to the calendar, and undo it if you change your mind',
    ],
    cta: 'Build a block',
    href: '/workout-planner',
    accent: '#8b5cf6',
  },
  {
    id: 'annual-plan',
    section: 'plan',
    icon: MapIcon,
    label: 'Season',
    title: 'Map out the season',
    body: 'Put the year on one page: races, phases and weekly load targets, so a block in March knows what it is preparing for in July.',
    bullets: [
      'Phases and target hours per week',
      'Races anchored to the calendar',
      'Weekly plan vs what you actually did',
    ],
    cta: 'Open annual plan',
    href: '/annual-training-plan',
    accent: '#0ea5e9',
    // The route is behind ProtectedRoute allowedRoles={['admin']} while the ATP
    // is still being shaped. Advertising it to everyone would send athletes
    // into a wall. Drop this flag the day the route opens up.
    adminOnly: true,
  },
  {
    id: 'more-tests',
    section: 'test',
    icon: BeakerIcon,
    label: 'Testing',
    title: 'VLamax and critical power',
    body: 'Lactate is not the only test in the app. Run a VLamax sprint or a critical-power set and read them next to your curve.',
    bullets: [
      'VLamax from a 15-second all-out effort',
      'CP and W′ from two or more efforts',
      'Both stored with your test history',
    ],
    cta: 'Open testing',
    href: '/testing',
    accent: '#10b981',
  },
  {
    id: 'week-review',
    section: 'plan',
    icon: CalendarDaysIcon,
    label: 'Review',
    title: 'Write the week down',
    body: 'Each week gets a note of its own — what went well, what hurt, what to change — kept beside the numbers that week produced.',
    bullets: [
      'Week totals per sport, planned against done',
      'Your own note on the same screen',
      'Reads back months later as a training diary',
    ],
    cta: 'Open the calendar',
    href: '/training-calendar',
    accent: '#6366f1',
  },
  {
    id: 'health-log',
    section: 'anywhere',
    icon: HeartIcon,
    label: 'Health',
    title: 'Log illness and injury',
    body: 'Note a cold, a niggle or a bad night and the app stops reading a missed week as lost fitness — recovery becomes part of the record.',
    bullets: [
      'Illness and injury episodes with a timeline',
      'Sleep, resting HR and HRV alongside',
      'Readiness on the dashboard reacts to it',
    ],
    cta: 'Open health',
    href: '/health',
    accent: '#f43f5e',
  },
  {
    id: 'share',
    section: 'train',
    icon: ShareIcon,
    label: 'Sharing',
    title: 'Share a session or your week',
    body: 'Turn any activity — or a whole week — into an image worth posting, with your route, numbers and zones on it.',
    bullets: [
      'Several layouts, light and dark',
      'Straight into Instagram, Strava or Messages',
      'Save to Photos and use it anywhere',
    ],
    cta: 'Open the calendar',
    href: '/training-calendar',
    accent: '#0891b2',
  },
  {
    id: 'daily-coach',
    section: 'train',
    icon: SunIcon,
    label: 'Every morning',
    title: 'A read on today before you start',
    body: 'The card at the top of the dashboard says what today should feel like — go hard, hold back, or take the day — from your form, your fatigue and last night’s sleep.',
    bullets: [
      'Written for today, not a generic tip',
      'Reacts to a bad night or a missed week',
      'Arrives as a notification if you want it',
    ],
    cta: 'Open dashboard',
    href: '/dashboard',
    accent: '#f59e0b',
  },
  {
    id: 'readiness',
    section: 'anywhere',
    icon: MoonIcon,
    label: 'Recovery',
    title: 'See whether you are recovered',
    body: 'Resting heart rate, HRV and sleep charted next to your training load, so a heavy week and a bad night are visible in the same place.',
    bullets: [
      'Resting HR, low HR, HRV and sleep',
      'Compared with your own baseline, not a population',
      'Flags the days worth backing off',
    ],
    cta: 'Open dashboard',
    href: '/dashboard',
    accent: '#8b5cf6',
  },
  {
    id: 'ai-test-coach',
    section: 'test',
    icon: SparklesIcon,
    label: 'Test coach',
    title: 'Have your test read back to you',
    body: 'Ask what the curve means: where the thresholds sit, what shifted since last time, and what to train first — in words, next to the chart.',
    bullets: [
      'Reads your own numbers, not an example',
      'Compares against your previous tests',
      'Turns into training advice you can act on',
    ],
    cta: 'Open testing',
    href: '/testing',
    accent: '#7c3aed',
  },
  {
    id: 'field-lactate',
    section: 'test',
    icon: BeakerIcon,
    label: 'Field test',
    title: 'Take lactate out of the lab',
    body: 'Log samples during a normal session — a step test on the road, a threshold set in the pool — and they land on the same curve as a lab test.',
    bullets: [
      'Record values while the session is running',
      'Attached to the interval they came from',
      'Feeds the same threshold model',
    ],
    cta: 'Open the calendar',
    href: '/training-calendar',
    accent: '#ef4444',
  },
  {
    id: 'smart-trainer',
    section: 'train',
    icon: CpuChipIcon,
    label: 'Sensors',
    title: 'Drive a smart trainer in ERG',
    body: 'Pair an FTMS trainer or a heart-rate strap over Bluetooth and let the planned workout set the watts for you, interval by interval.',
    bullets: [
      'ERG mode: the trainer follows the plan',
      'Live power, cadence and heart rate',
      'Works in the app and in desktop Chrome',
    ],
    cta: 'Open the calendar',
    href: '/training-calendar',
    accent: '#0ea5e9',
  },
  {
    id: 'templates',
    section: 'plan',
    icon: RectangleStackIcon,
    label: 'Templates',
    title: 'Save a session and reuse it',
    body: 'The intervals you keep rebuilding become a template — pick it off the shelf next week instead of typing it again.',
    bullets: [
      'Your own library of structured sessions',
      'Drop one onto any day',
      'Test protocols get the same treatment',
    ],
    cta: 'Open the planner',
    href: '/workout-planner',
    accent: '#6366f1',
  },
  {
    id: 'comments',
    section: 'coach',
    icon: ChatBubbleLeftRightIcon,
    label: 'Feedback',
    title: 'Talk about a specific session',
    body: 'Comments live on the workout and on the test, so feedback sits next to the data it is about instead of in a chat thread nobody can find later.',
    bullets: [
      'Coach and athlete on the same session',
      'Also on lactate tests',
      'Stays with the workout in the history',
    ],
    cta: 'Open the calendar',
    href: '/training-calendar',
    accent: '#d946ef',
  },
  {
    id: 'weather',
    section: 'train',
    icon: CloudIcon,
    label: 'Context',
    title: 'See the weather you rode in',
    body: 'Heat, wind and humidity stored with the activity — the reason a normal power felt awful in July stops being a mystery.',
    bullets: [
      'Temperature, wind and humidity per activity',
      'Explains heart-rate drift on hot days',
      'Useful next to heat-training sessions',
    ],
    cta: 'Open the calendar',
    href: '/training-calendar',
    accent: '#0891b2',
  },
  {
    id: 'notifications',
    section: 'anywhere',
    icon: BellAlertIcon,
    label: 'Reminders',
    title: 'Be reminded, not nagged',
    body: 'Choose what reaches your phone: today’s session, the morning read, a coach comment, a finished import.',
    bullets: [
      'Every category switched on or off separately',
      'Push on the phone, email where it makes sense',
      'Quiet by default — you opt in',
    ],
    cta: 'Open notifications',
    href: '/settings?tab=notifications',
    accent: '#f43f5e',
  },
  {
    id: 'watch',
    section: 'anywhere',
    icon: ClockIcon,
    label: 'Apple Watch',
    title: 'Your zones on your wrist',
    body: 'The watch app carries today’s session and your zones, so the numbers you train by are on the arm you look at.',
    bullets: [
      'Today’s plan on the watch',
      'Zones from your own lactate test',
      'Installed with the iPhone app',
    ],
    cta: 'Get the app',
    href: 'https://apps.apple.com/cz/app/lachart/id6764768876?l=cs',
    accent: '#111827',
  },
  {
    id: 'calculators',
    section: 'test',
    icon: CalculatorIcon,
    label: 'Calculators',
    title: 'Quick numbers without a test',
    body: 'FTP, VO₂max, TSS, race times, zone 2, heat and altitude — free calculators for when you need an answer now.',
    bullets: [
      'Zones from FTP or threshold heart rate',
      'Race predictor across distances',
      'Heat and altitude adjustment',
    ],
    cta: 'Open calculators',
    href: '/training-zones-calculator',
    accent: '#10b981',
  },
];

/** One flat catalogue: release slides + the extras, both in the same shape. */
export const FEATURE_ENTRIES = [
  ...WHATS_NEW_SLIDES.map((slide) => ({
    id: slide.id,
    section: SECTION_BY_SLIDE[slide.id] || 'train',
    icon: slide.icon,
    label: slide.label,
    title: slide.title,
    body: slide.body,
    bullets: slide.bullets || [],
    cta: slide.cta,
    href: slide.href,
    accent: slide.accent,
    coachOnly: Boolean(slide.coachOnly),
    stravaOnly: Boolean(slide.stravaOnly),
    adminOnly: false,
    video: slide.video || null,
    image: slide.image || null,
  })),
  ...EXTRA_ENTRIES.map((e) => ({
    ...e,
    bullets: e.bullets || [],
    coachOnly: Boolean(e.coachOnly),
    stravaOnly: Boolean(e.stravaOnly),
    adminOnly: Boolean(e.adminOnly),
    video: null,
    image: null,
  })),
];

/**
 * Who counts as a coach for the purpose of showing coach features.
 *
 * Deliberately not the same question as "does this account get the coach
 * navigation" — an admin on an athlete account wants the athlete's guide.
 */
export function isCoachViewer(user) {
  return ['coach', 'tester', 'testing'].includes(user?.role);
}

/**
 * Lower-cased and stripped of diacritics, so "laktát", "laktat" and "Laktát"
 * are one query. iOS also capitalises the first letter of a search field on
 * its own, which is reason enough on its own.
 */
function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Czech words for what each feature is, because the interface is English and
 * the athletes using it are not. Searching "závod" has to find the race card.
 */
export const FEATURE_KEYWORDS = {
  'strava-connect': 'strava propojeni synchronizace import zarizeni',
  'import-categorize': 'import fit soubor kategorie automaticky trenink',
  'analyze-workout': 'analyza trenink graf vykon tep tempo kadence prevyseni',
  'power-profile': 'vykon watty krivka nejlepsi vykony sprint',
  'compare-tests': 'porovnani srovnat dva treninky testy',
  'lactate-curve': 'laktat laktatova krivka test prah lt1 lt2 obla iat mmol',
  'training-zones': 'zony treninkove zony tep vykon tempo',
  'lactate-interval': 'laktat interval odber vzorek mmol lap',
  'plan-workout': 'plan planovani trenink intervaly sablona kalendar',
  'race-planning': 'zavod zavody taper vyladeni forma startovka',
  'form-fitness': 'forma fitness unava ctl atl tsb kondice',
  'live-workout': 'zivy trenink vedeni kroky intervaly hodinky',
  'pdf-branding': 'pdf report protokol branding logo znacka klient',
  'coach-squad': 'trener sverenci atleti tym skupina pozvanka',
  'ios-app': 'iphone mobil aplikace widget hodinky',
  'garmin-apple-health': 'garmin apple health zdravi import spanek tep hrv',
  'block-builder': 'plan blok generator plavani kolo beh triatlon objem hodiny',
  'annual-plan': 'rocni plan sezona faze periodizace',
  'more-tests': 'vlamax cp kriticky vykon test sprint',
  'week-review': 'tydenni shrnuti poznamka denik review',
  'health-log': 'nemoc zraneni zdravi spanek hrv regenerace',
  share: 'sdileni sdilet instagram obrazek story',
  'daily-coach': 'rada dnes trener denni doporuceni jak se citit',
  readiness: 'regenerace pripravenost spanek hrv klidovy tep unava',
  'ai-test-coach': 'ai umela inteligence rozbor testu vysvetleni doporuceni',
  'field-lactate': 'terenni laktat odber v treninku bazen silnice krokovy test',
  'smart-trainer': 'trenazer bluetooth erg ftms senzory hrudni pas watty',
  templates: 'sablony knihovna treninku opakovat protokol',
  comments: 'komentare zpetna vazba trener diskuze poznamka',
  weather: 'pocasi teplota vitr vlhkost horko',
  notifications: 'notifikace upozorneni pripominka push email',
  watch: 'apple watch hodinky zapesti',
  calculators: 'kalkulacka vypocet ftp vo2max tss zony zavod predikce nadmorska vyska horko vaha',
};

/** Does this entry answer what the athlete typed in the search box? */
export function matchesQuery(entry, query) {
  const q = normalize(query).trim();
  if (!q) return true;
  const haystack = normalize(
    [entry.title, entry.body, entry.label, ...(entry.bullets || []), FEATURE_KEYWORDS[entry.id] || '']
      .filter(Boolean)
      .join(' '),
  );
  // Every word has to appear somewhere, so "lactate zones" narrows rather than widens.
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * The catalogue as sections, filtered for who is looking.
 *
 * @param {{ isCoach?: boolean, stravaConnected?: boolean, query?: string }} opts
 *   stravaConnected === false hides the connect-Strava entry only when we know
 *   it is already connected — undefined means "not sure", and showing it is the
 *   harmless answer.
 * @returns {Array<{id: string, title: string, blurb: string, items: Array}>}
 *   sections with at least one entry, in GUIDE_SECTIONS order
 */
export function buildFeatureGuide({ isCoach = false, isAdmin = false, stravaConnected, query = '' } = {}) {
  const visible = FEATURE_ENTRIES.filter((entry) => {
    if (entry.coachOnly && !isCoach) return false;
    if (entry.adminOnly && !isAdmin) return false;
    if (entry.stravaOnly && stravaConnected === true) return false;
    return matchesQuery(entry, query);
  });

  return GUIDE_SECTIONS
    .map((section) => ({
      ...section,
      items: visible.filter((entry) => entry.section === section.id),
    }))
    .filter((section) => section.items.length > 0);
}

/** How many things this athlete can do — the number in the page header. */
export function countFeatures({ isCoach = false, isAdmin = false, stravaConnected } = {}) {
  return buildFeatureGuide({ isCoach, isAdmin, stravaConnected })
    .reduce((n, section) => n + section.items.length, 0);
}

export default buildFeatureGuide;
