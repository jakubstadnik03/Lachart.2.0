/**
 * What each free calculator page says for itself.
 *
 * The nine calculator URLs rendered one component with a different title
 * on top — 250 words each, 86 % identical from page to page, and the Zone 2
 * page the same body as the lactate one to the word. Google files that as
 * one page with nine addresses and indexes one of them. Each tool now
 * carries its own explanation and its own questions, so each URL is a page
 * about one thing. Keyed by the SEO key (zone2 has its own entry although
 * it shows the lactate calculator).
 */
export const CALCULATOR_GUIDES = {
  lactate: {
    heading: 'How the lactate threshold calculator works',
    paras: [
      'A lactate step test raises the intensity in stages — 3 to 5 minutes each, a blood sample at the end of every stage — and plots lactate against power or pace. At easy intensities lactate sits close to its resting value; as the effort climbs it starts to rise, then rises steeply. The two bends in that curve are the thresholds.',
      'LT1, the aerobic threshold, is where lactate first leaves its baseline — the top of what you can sustain for hours. LT2, the anaerobic threshold, is where production outruns clearance and the curve turns upward; it is the intensity you can hold for roughly an hour. The calculator reads both off a fitted curve and shows the fixed-point methods beside them: OBLA at 4.0 mmol/L, the individual anaerobic threshold at baseline + 1.5 mmol/L, D-max and log-log.',
      'Enter four or more stages with power or pace and lactate — heart rate makes the zones better — and the curve, LT1 and LT2 are drawn immediately. A free account adds the remaining methods, the confidence score and training zones built from the thresholds.',
    ],
    faq: [
      ['How many stages does a lactate test need?', 'At least four; six to eight give the curve enough shape to place both thresholds. Start well below your expected LT1 and keep the steps even — 20–30 W on the bike, 15–20 s/km running — so the bend is not hidden in a single big jump.'],
      ['What lactate value is LT2?', 'There is no single number. OBLA fixes it at 4.0 mmol/L, which suits many trained athletes, but individuals turn anywhere from 2.5 to 5.5 mmol/L. That is why the calculator reads the shape of the curve rather than a line across it, and shows the fixed-point methods for comparison.'],
      ['Does it work for running and swimming?', 'Yes. For pace sports the intensity axis is pace (or speed), slower on the left and faster on the right, and the thresholds come out as min/km or min/100 m with the heart rate at each.'],
    ],
  },
  zone2: {
    heading: 'How to find your Zone 2 from a lactate test',
    paras: [
      'Zone 2 is the intensity just below your first lactate threshold: the hardest effort at which lactate still stays close to its resting level, typically between 1.5 and 2.0 mmol/L. It is where the aerobic system does almost all the work, mitochondria and fat oxidation adapt most, and the session leaves you able to train again tomorrow.',
      'Percent-of-FTP or percent-of-max-heart-rate rules put Zone 2 in roughly the right place for an average athlete and the wrong place for many real ones — a well-trained rider may hold 80 % of FTP at 1.8 mmol/L, a beginner may be past LT1 at 65 %. A step test measures where your own curve starts to rise, and that point is the ceiling of your Zone 2.',
      'Enter the stages of a lactate test and the calculator draws the curve and places LT1 on it. The band below LT1, with its power or pace and the heart rate that went with it, is your Zone 2. A free account turns it into a full zone table you can train from and pushes it to your watch.',
    ],
    faq: [
      ['What should lactate be in Zone 2?', 'Steady, and close to baseline — for most athletes 1.5–2.0 mmol/L, rising by less than about 0.5 mmol/L over a long session. If a sample taken 40 minutes in reads clearly higher than one taken at 10 minutes, the pace is above Zone 2 even if it feels easy.'],
      ['Can I use heart rate instead of lactate for Zone 2?', 'Once you know where LT1 sits, yes: the heart rate at LT1 from the test is the top of your Zone 2 and holds for weeks. Heart rate on its own, from a formula, does not know where your threshold is.'],
      ['How long should Zone 2 sessions be?', 'Long enough for the aerobic stimulus to accumulate — 60 to 90 minutes for most people, longer for trained endurance athletes. Two to four such sessions a week is the usual base; the intensity is easy on purpose, the volume is the work.'],
    ],
  },
  ftp: {
    heading: 'How the FTP calculator works',
    paras: [
      'Functional Threshold Power is the highest power you can sustain for about an hour. The common field estimate is 95 % of your best 20-minute average power, ridden after a proper warm-up and a short hard effort to take the edge off anaerobic capacity. Enter that 20-minute value and your weight and the calculator gives FTP, watts per kilogram and the seven Coggan power zones built from it.',
      'The zones scale from FTP: active recovery below 55 %, endurance to 75 %, tempo to 90 %, threshold to 105 %, VO₂max to 120 %, anaerobic capacity to 150 % and neuromuscular power above that. W/kg places you on the usual scale from recreational to world class — a rough reference, since aero drag decides flat speed and only climbing follows W/kg closely.',
      'FTP is a good working number and a blunt one: it says nothing about where your aerobic threshold sits or how lactate behaves below it. A lactate test measures both thresholds directly; FTP usually lands close to LT2 but not on it.',
    ],
    faq: [
      ['Is 95 % of 20-minute power accurate?', 'For most riders it lands within a few percent of a true hour power. Riders with a large anaerobic capacity overestimate — their 20-minute effort leans on it — and would do better with a 40–60 minute test, or a lactate test, which does not depend on pacing at all.'],
      ['How often should I retest FTP?', 'Every six to eight weeks in a build, or whenever sessions at threshold start to feel clearly easier or harder than the zones say. A new test moves every zone with it.'],
      ['Is FTP the same as LT2?', 'Close, not the same. LT2 is a physiological point read from blood lactate; FTP is a performance estimate from a time trial. They usually sit within a few percent of each other, and when they differ the lactate test is the one that explains why.'],
    ],
  },
  vo2max: {
    heading: 'How the VO₂max estimate works',
    paras: [
      'VO₂max is the highest rate at which your body can take up and use oxygen, in millilitres per kilogram per minute. Measuring it needs a gas analyser; estimating it needs a maximal effort of a few minutes, because the power you can hold for five minutes is closely tied to it. This calculator uses the cycling formula published by Sitko and colleagues in 2022: VO₂max ≈ 10.8 × (5-minute power ÷ weight) + 7.',
      'Enter your best 5-minute average power and your weight and the estimate appears with a classification, from below average to elite. Ride the 5 minutes fresh, warmed up, and as evenly as you can — a fast start that fades gives a lower average than the same legs paced well.',
      'VO₂max sets a ceiling; it does not decide the race. Two riders with the same VO₂max can have thresholds 15 % apart, and it is the threshold that decides who holds the pace. That is what a lactate test measures.',
    ],
    faq: [
      ['How accurate is a VO₂max estimate from power?', 'The Sitko equation was fitted on trained cyclists and lands within a few ml/kg/min for most of them. It assumes a true maximal, well-paced 5-minute effort; an under-paced one reads low. Treat it as a good field estimate, not a lab value.'],
      ['Can I raise my VO₂max?', 'Yes, mostly with intervals of three to five minutes at or slightly above the 5-minute power you just entered, repeated three to six times with equal recovery, once or twice a week on top of an aerobic base. Gains come faster for beginners and slow as you approach your genetic ceiling.'],
      ['Does this work for running?', 'The formula is for cycling power. Runners can estimate VO₂max from a recent race time — the race predictor on this page works the other way, from time to time — or from a lactate test, which finds the thresholds that matter more for racing.'],
    ],
  },
  race: {
    heading: 'How the race time predictor works',
    paras: [
      'The predictor uses the Riegel formula: T₂ = T₁ × (D₂ ÷ D₁)^1.06. It takes one performance you have actually run and scales it to other distances with an exponent that captures how pace falls as distance grows. Enter the distance and time of a recent race and the predicted times for 1 km, 5 km, 10 km, the half marathon and the marathon appear together.',
      'The prediction is only as good as the reference. A 5 km run last week predicts a 10 km well; it predicts a marathon poorly, because nothing in five kilometres says how you cope with three hours. Use the race nearest in distance to the one you are planning.',
      'The formula assumes the endurance to match — a runner whose lactate rises early fades more over the long distances than 1.06 allows. LaChart\'s race predictor inside the app corrects for that using your lactate curve and training history rather than a fixed exponent.',
    ],
    faq: [
      ['Why does the marathon prediction seem too fast?', 'Riegel\'s exponent was fitted on well-trained runners with the mileage for the distance. With a lower weekly volume the real fade is larger; many runners find an exponent of 1.08–1.10 nearer the truth for the marathon. Fuelling and heat can add more.'],
      ['Which reference race should I use?', 'The most recent one, at the distance closest to your goal, run in reasonable conditions on a similar course. A hilly, hot 10 km predicts a flat, cool half marathon badly in both directions.'],
      ['How do I turn a predicted time into a pace plan?', 'Divide the time by the distance for an even pace, then bank nothing: most good races are run at an even or slightly negative split. The heat and altitude calculator on this page adjusts the target for conditions.'],
    ],
  },
  tss: {
    heading: 'How the TSS calculator works',
    paras: [
      'Training Stress Score puts a number on how much a session cost. It combines duration with intensity relative to your threshold: TSS = (seconds × NP × IF) ÷ (FTP × 3600) × 100, where IF, the intensity factor, is normalized power divided by FTP. One hour exactly at FTP scores 100; an easy two-hour ride and a hard forty-minute session can score the same.',
      'Enter the duration, the normalized (or average) power and your FTP and the calculator returns IF and TSS with a label for the load. Under 150 a session is usually absorbed by the next day; 150–300 leaves some fatigue into the next one; 300–450 lingers for two days; above 450 needs several days.',
      'Summed over days, TSS drives the fitness–fatigue model: CTL, the 42-day average, is your fitness; ATL, the 7-day average, your fatigue; and TSB, the difference, your form. LaChart calculates all three from every synced ride and run.',
    ],
    faq: [
      ['What is a good weekly TSS?', 'It depends on what you can absorb. Recreational riders sit around 300–500 a week, serious amateurs 500–800, professionals well above 1000. A ramp of more than 5–8 CTL points a week is where injury and illness start to appear.'],
      ['What about running or sessions without power?', 'Running uses rTSS from pace against threshold pace, and any sport can use hrTSS from heart rate against threshold heart rate. The scale is the same — an hour at threshold is 100 — so the sports add up in one load.'],
      ['Why does TSS use normalized rather than average power?', 'Because a variable ride costs more than its average suggests. Normalized power weights the hard moments the way the body feels them, so an interval session with a low average still scores as the hard session it was.'],
    ],
  },
  zones: {
    heading: 'How the training zones calculator works',
    paras: [
      'Training zones are bands of intensity with a purpose each, anchored to a threshold. Power zones use FTP and the seven-zone Coggan model; heart-rate zones use your lactate threshold heart rate (LTHR) with five bands; run pace zones use your threshold pace. Enter whichever thresholds you have and the calculator builds every table it can.',
      'Power responds instantly and is the most precise; heart rate lags a minute or two and drifts with heat, fatigue and caffeine, but it is the one you have on every run and swim; pace is the truth for running on flat ground. The three tables describe the same physiology from three sides, which is why LaChart shows them together.',
      'Zones from a single threshold assume the shape of your curve below it. A lactate test measures that shape: LT1 becomes the top of Zone 2 and LT2 the top of Zone 4, and the zones are yours rather than an average athlete\'s.',
    ],
    faq: [
      ['Should I train by power, heart rate or pace?', 'Use power where you have it, pace for flat running, and heart rate as the check that the other two are not lying — a heart rate well above the zone at the usual power is the body saying it is tired, hot or ill.'],
      ['How often should I update my zones?', 'Whenever the threshold behind them moves — after a new FTP test, a new race or a new lactate test, typically every six to ten weeks in a build. LaChart updates every zone table when a test is saved.'],
      ['Why are my heart-rate zones different from a percent-of-max formula?', 'Because maximum heart rate says little about where your threshold sits. Two athletes with the same maximum can have LTHR 15 beats apart; zones anchored to the threshold follow the athlete, zones anchored to the maximum follow the formula.'],
    ],
  },
  env: {
    heading: 'How the heat and altitude calculator works',
    paras: [
      'Heat and altitude both slow you down, and both by amounts you can plan for. In the heat, blood is diverted to the skin to shed the load, less reaches the muscles, and sustainable pace falls — gently at first, then steeply as the wet-bulb temperature climbs, because humidity stops sweat from cooling you. At altitude the air carries less oxygen, and every aerobic effort above the lactate threshold is slower for it.',
      'Enter the temperature, humidity and elevation of the race and the calculator adjusts a target pace or power to the conditions. The loss is a percentage that grows with the effort duration — a marathon suffers more from 28 °C than a 5 km does — and, for altitude, with the height and how little time you have had to acclimatise.',
      'The correction says what the day is worth, so you set out at a pace the conditions allow rather than the one your fitness would allow at 15 °C and sea level. Going out at the flat-and-cool target in the heat is the most common way a well-prepared race is lost.',
    ],
    faq: [
      ['How much slower is a marathon in the heat?', 'From about 15 °C upward the loss grows roughly with every degree, and faster once humidity is high: 25 °C and humid typically costs a marathon runner several percent, and 30 °C with high humidity well over that. Shorter races lose less because the body has less time to heat up.'],
      ['Does altitude affect short races too?', 'Less. Sprints and efforts under a minute barely notice it; anything aerobic does, and the longer the race the more. Above about 1500 m the loss becomes noticeable, and the first days are worst — acclimatising for two to three weeks recovers part of it.'],
      ['Can I train in the heat to blunt the effect?', 'Yes. Ten to fourteen days of training in the heat raises plasma volume and sweat rate and lowers the cost of a given pace in hot conditions, with the effect lasting a couple of weeks after. It does not remove the loss, so still adjust the target.'],
    ],
  },
  weight: {
    heading: 'How the weight and power calculator works',
    paras: [
      'Watts per kilogram is the number that decides climbs. On a flat road most of the effort goes into pushing air, which does not care what you weigh; on a steep climb almost all of it goes into lifting you against gravity, and the rider with more watts per kilogram rides away. The calculator shows how a change in body weight moves your W/kg, and what that does to flat speed and to climbing speed separately.',
      'Enter your current weight, your FTP and the weight you are considering. The flat-speed change is small — a lighter rider has slightly less frontal area, and that is about all — while the climbing change follows W/kg almost directly. On a 8 % climb, two kilograms is worth roughly the same as 6–8 W.',
      'Losing weight only helps while the power stays. Below a healthy weight the watts go first, and the ratio gets worse, not better; the calculator assumes the FTP you enter survives the change, which is the assumption to question before you start.',
    ],
    faq: [
      ['How much does 1 kg matter on a climb?', 'On a long climb at threshold, about 1–1.5 % of climbing speed per kilogram for a 70 kg rider — roughly the same as 3–4 W of FTP. The steeper the climb, the closer the relation gets to pure W/kg.'],
      ['Why does weight matter so little on the flat?', 'Because at 40 km/h around 90 % of your power is spent on air resistance, which depends on your frontal area and position, not your mass. Two kilograms changes frontal area very little; a lower position changes it a lot.'],
      ['Should I lose weight to improve W/kg?', 'Only if you are carrying weight that is not muscle and can lose it while the training stays intact. A lactate test before and after tells you whether the thresholds held; if LT2 in watts fell with the weight, the ratio you gained on paper was not real on the road.'],
    ],
  },
};
