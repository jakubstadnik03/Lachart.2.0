/**
 * Rotating daily lesson for the coaching card.
 *
 * Picked deterministically from the date so every render — web, native shell,
 * push notification, Expo app — shows the same lesson on the same day, and so
 * an athlete can't reshuffle it by pulling to refresh.
 *
 * Bias is deliberately toward lactate and threshold literacy: that is the part
 * of training most athletes get wrong, and the part LaChart can actually teach
 * from their own numbers.
 */

export const DAILY_LESSONS = [
  {
    tag: 'Lactate',
    title: 'Lactate is fuel, not waste',
    body: 'It is produced constantly, even at rest, and shuttled to the heart, brain and slow-twitch fibres to be burned. A rising blood value means production has outrun clearance — not that something toxic is accumulating.',
  },
  {
    tag: 'Lactate',
    title: 'Why LT1 matters more than you think',
    body: 'LT1 is the first rise above baseline — roughly where fat oxidation peaks. Most of your endurance hours should sit below it. Athletes who creep just above LT1 on easy days get the fatigue of tempo with the adaptation of neither.',
  },
  {
    tag: 'Lactate',
    title: 'LT2 is a ceiling, not a target',
    body: 'The maximal lactate steady state is the fastest pace you can hold with lactate stable. Training at it constantly is how you plateau: it is demanding enough to cost recovery, not novel enough to force adaptation.',
  },
  {
    tag: 'Testing',
    title: 'One value tells you almost nothing',
    body: 'A single 4 mmol reading without the surrounding curve, the step protocol and the duration is close to meaningless. The shape of the curve — where it lifts, how steeply — is the information.',
  },
  {
    tag: 'Testing',
    title: 'Test in the state you train in',
    body: 'Glycogen depletion, heat, caffeine and a bad night all shift the curve. Repeat your protocol under the same conditions, or you will read noise as progress.',
  },
  {
    tag: 'Testing',
    title: 'The 0.3 mmol trap',
    body: 'Analyser error, fingertip sweat and sampling timing move a reading by a few tenths on their own. If two tests differ by less than about 0.4 mmol at the same load, treat them as the same test.',
  },
  {
    tag: 'Physiology',
    title: 'VLamax is the other dial',
    body: 'Two athletes with identical VO₂max can have very different threshold power. High glycolytic rate lifts sprint ability and lowers the sustainable fraction. Sprinters want it high, time triallists want it low.',
  },
  {
    tag: 'Physiology',
    title: 'Fat and carbohydrate are not a switch',
    body: 'Both fuels are burning at every intensity — the mix slides. The crossover point moves right with training, which is why an aerobic base changes what you can do late in a long race.',
  },
  {
    tag: 'Physiology',
    title: 'Heart rate lags, lactate does not',
    body: 'Cardiac drift, heat and dehydration push heart rate up at unchanged power. For interval prescription, power or pace is the honest signal — heart rate is the confirmation.',
  },
  {
    tag: 'Training',
    title: 'Polarised is about time, not sessions',
    body: 'The 80/20 split refers to time spent in each intensity band, not to how many workouts you do. Three easy runs and two interval sessions can still be 60/40 if the easy runs are not easy.',
  },
  {
    tag: 'Training',
    title: 'The easy day is the hard discipline',
    body: 'Almost nobody fails at going hard. Athletes fail at going genuinely easy, because it feels unproductive. Riding easy is what makes the hard sessions possible.',
  },
  {
    tag: 'Training',
    title: 'Volume builds the engine, intensity tunes it',
    body: 'Aerobic adaptations — capillaries, mitochondria, stroke volume — respond mostly to accumulated hours. Intensity sharpens what volume built. Reverse the order and you sharpen very little.',
  },
  {
    tag: 'Load',
    title: 'What TSS actually measures',
    body: 'It is duration weighted by how close you rode to threshold, squared. That squaring is why 30 minutes at threshold and two easy hours can land in the same place — while asking completely different things of you.',
  },
  {
    tag: 'Load',
    title: 'Fitness and Fatigue are the same data, different memory',
    body: 'CTL averages your load over about 42 days, ATL over about 7. Form is simply the gap. Nothing mystical happens at any particular number.',
  },
  {
    tag: 'Load',
    title: 'Form near zero is not a plateau',
    body: 'It means acute load matches chronic load — you are absorbing exactly what you are doing. That is a perfectly good place to spend most of a base block.',
  },
  {
    tag: 'Recovery',
    title: 'Adaptation happens after, not during',
    body: 'The session is the stimulus. The fitness is written in the hours of sleep and eating that follow. Training harder while recovering less is subtraction dressed as addition.',
  },
  {
    tag: 'Recovery',
    title: 'Sleep is the largest lever you are not pulling',
    body: 'Growth hormone release, glycogen resynthesis and central fatigue clearance are all sleep-dependent. No supplement, protocol or session moves the needle like a consistent extra hour.',
  },
  {
    tag: 'Recovery',
    title: 'Resting heart rate tells you late',
    body: 'By the time waking heart rate is clearly elevated, you have usually been overreaching for days. Mood, sleep quality and reluctance to start are earlier signals — and free.',
  },
  {
    tag: 'Fuelling',
    title: 'Under-fuelling looks exactly like overtraining',
    body: 'Falling power, poor sleep, low mood, no top end. Before you cut training, count the calories going in — chronic energy deficiency produces the whole overtraining picture on its own.',
  },
  {
    tag: 'Fuelling',
    title: 'Carbohydrate is trainable',
    body: 'The gut adapts. Athletes who practise 60–90 g/h in training tolerate it on race day; athletes who try it for the first time in a race spend the last hour learning why not to.',
  },
  {
    tag: 'Fuelling',
    title: 'Fasted training has a narrow use',
    body: 'It nudges fat oxidation, but it also blunts intensity and raises stress hormones. Useful occasionally in easy sessions, counterproductive as a default.',
  },
  {
    tag: 'Zones',
    title: 'Zones are borrowed until you test',
    body: 'Percentage-of-max formulas describe a population, not you. Two athletes with the same FTP can have thresholds 15 bpm apart. Testing replaces an estimate with a measurement.',
  },
  {
    tag: 'Zones',
    title: 'Your zones expire',
    body: 'Thresholds move with fitness, illness, altitude and season. A zone set that is eight months old is a historical document, not a prescription.',
  },
  {
    tag: 'Zones',
    title: 'Sport-specific thresholds are genuinely different',
    body: 'Running threshold heart rate typically sits above cycling by 5–10 bpm, swimming lower again. Carrying one set of zones across all three is a common and expensive mistake.',
  },
  {
    tag: 'Racing',
    title: 'Taper by cutting volume, not intensity',
    body: 'Keep the sharp work, shed the hours. Dropping intensity in taper week makes you flat; dropping volume makes you fresh.',
  },
  {
    tag: 'Racing',
    title: 'The first ten minutes cost the most',
    body: 'Going out above threshold in the opening minutes drains the anaerobic reserve you need at the end. Almost every negative-split race is faster than the athlete expected.',
  },
  {
    tag: 'Racing',
    title: 'Fitness peaks are narrower than people plan for',
    body: 'A genuine peak holds for roughly two to three weeks. Scheduling four A-races across a season is scheduling four B-races.',
  },
  {
    tag: 'Consistency',
    title: 'The best block is the one you repeat',
    body: 'Twelve unremarkable weeks completed beat six brilliant weeks followed by six lost to illness or injury. Training is compounding, and compounding punishes gaps.',
  },
  {
    tag: 'Consistency',
    title: 'Missing one session changes almost nothing',
    body: 'CTL moves by roughly a point. What damages a block is the pattern that follows a missed session — the guilt-driven double, or quietly stopping.',
  },
  {
    tag: 'Consistency',
    title: 'Progress is not linear and never was',
    body: 'Fitness arrives in steps with plateaus between them, because adaptation is a slower process than stimulus. A flat month inside a rising six-month trend is not a problem to solve.',
  },
];

function dayIndex(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 0;
  // Days since epoch in local time — stable within a calendar day, advances at midnight.
  const utcMidnight = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(utcMidnight / 86400000);
}

/**
 * Lesson of the day. Optionally salted per athlete so two athletes on the same
 * team don't get identical cards every morning.
 */
export function getDailyLesson(date = new Date(), salt = '') {
  if (!DAILY_LESSONS.length) return null;
  let offset = 0;
  for (let i = 0; i < String(salt).length; i += 1) {
    offset = (offset + String(salt).charCodeAt(i)) % DAILY_LESSONS.length;
  }
  const idx = (((dayIndex(date) + offset) % DAILY_LESSONS.length) + DAILY_LESSONS.length) % DAILY_LESSONS.length;
  return DAILY_LESSONS[idx];
}
