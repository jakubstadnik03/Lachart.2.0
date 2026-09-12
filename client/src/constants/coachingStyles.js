/**
 * Coaching voices for the daily card.
 *
 * The card's *facts* come from the athlete's data (see utils/dailyCoachCard.js).
 * A style only decides how those facts are framed — it never invents a claim the
 * numbers don't support. That split is deliberate: a tone slider that changes
 * the advice is a horoscope, one that changes the wording is a coach.
 *
 * Ordered gentlest → bluntest, with the data-only Nerd voice as the last stop
 * for athletes who want numbers and nothing else.
 */

/** Readiness buckets, from TSB (Form). Shared by every style. */
export const READINESS_STATES = ['veryFresh', 'fresh', 'neutral', 'productive', 'strained'];

export const READINESS_META = {
  veryFresh: {
    label: 'Very fresh',
    color: '#0EA5E9',
    bg: '#F0F9FF',
    border: '#BAE6FD',
    /** Freshness this deep usually means the load has fallen away, not that you are flying. */
    fact: 'Form is high and Fitness is drifting down — this is rest, not sharpness.',
  },
  fresh: {
    label: 'Fresh',
    color: '#059669',
    bg: '#ECFDF5',
    border: '#A7F3D0',
    fact: 'Form is positive. This is the window where hard work lands well.',
  },
  neutral: {
    label: 'Neutral',
    color: '#475569',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    fact: 'Form is near zero — neither carrying fatigue nor especially rested.',
  },
  productive: {
    label: 'Productive fatigue',
    color: '#B45309',
    bg: '#FFFBEB',
    border: '#FDE68A',
    fact: 'Negative Form with Fitness holding or rising — the normal cost of a build.',
  },
  strained: {
    label: 'Strained',
    color: '#B91C1C',
    bg: '#FEF2F2',
    border: '#FECACA',
    fact: 'Form is deep negative. Past this point extra load buys fatigue, not fitness.',
  },
};

/**
 * TSB thresholds. Scaled slightly by Fitness: a TSB of −25 means something very
 * different to a CTL 30 athlete than to a CTL 90 one, so the strained line moves
 * with the athlete rather than sitting at a fixed number.
 */
export function readinessStateFrom(form, fitness = 0) {
  const f = Number(form);
  if (!Number.isFinite(f)) return 'neutral';
  const ctl = Number(fitness) || 0;
  // ~−30 at CTL 60, ~−20 at CTL 30, capped so it never gets absurd either way.
  const strainedAt = Math.max(-45, Math.min(-18, -(18 + ctl * 0.2)));
  if (f > 20) return 'veryFresh';
  if (f > 5) return 'fresh';
  if (f >= -10) return 'neutral';
  if (f > strainedAt) return 'productive';
  return 'strained';
}

/** 0..1 position on the Form gauge (−40 → +30). */
export function formGaugePosition(form) {
  const f = Number(form);
  if (!Number.isFinite(f)) return 0.5;
  return Math.max(0, Math.min(1, (f + 40) / 70));
}

const STYLE_LIST = [
  {
    id: 'gentle',
    label: 'Gentle',
    blurb: 'Warm and unhurried. Never pushes.',
    greeting: (name) => (name ? `Morning, ${name}.` : 'Morning.'),
    headline: {
      veryFresh: ['You\'re well rested', 'Plenty in the tank', 'Rested, and then some'],
      fresh: ['You’re in a good place today', 'The legs feel willing today', 'A good day to be you'],
      neutral: ['Steady as you go', 'Ticking along nicely', 'All in balance'],
      productive: ['You’ve been working hard', 'The work is showing', 'Tired in the right way'],
      strained: ['Your body is asking for a break', 'Time to be gentle with yourself', 'Enough for now'],
    },
    frame: {
      veryFresh: ['Whenever you feel ready, something easy will bring the rhythm back.', 'No rush — an easy session will wake the legs up when you want it.'],
      fresh: ['If you fancy the hard session, today is a kind day for it.', 'If there’s a hard one on the list, today would carry it kindly.'],
      neutral: ['Nothing dramatic needed — just do what’s on the plan and enjoy it.', 'A plain, good day of training. Nothing to force, nothing to skip.'],
      productive: ['This tiredness is earned and normal. Be a little kind to yourself.', 'Heavy legs after a week like this are the plan working, not you failing.'],
      strained: ['Please take the easy option today. The fitness will still be there tomorrow.', 'The kindest thing today is less. The work you’ve done is already yours.'],
    },
    hardOnTired: {
      strained: (t) => `${t} is on the plan, but your legs are asking for less today. Moving it wouldn’t be a failure.`,
      productive: (t) => `${t} today, on tired legs. That’s normal this deep into a block — start the warm-up gently and see how it feels.`,
    },
    bodySays: {
      high: (r) => `${r}. That’s your body asking for a quiet day, and it’s worth listening to — whatever the plan says.`,
      watch: (r, t) => `${r}. ${t} is on the plan, but there’s no harm in keeping today gentle instead.`,
    },
    restLine: ['Nothing planned today — rest is part of the work.', 'A quiet day. Let the last few sessions settle in.', 'Nothing on the plan — that’s the plan.'],
  },
  {
    id: 'supportive',
    label: 'Supportive',
    blurb: 'Encouraging, with a nudge.',
    greeting: (name) => (name ? `Good morning, ${name}!` : 'Good morning!'),
    headline: {
      veryFresh: ['Rested and ready', 'Fully charged', 'Fresh legs, open road'],
      fresh: ['Green light', 'Good day for it', 'The window is open'],
      neutral: ['Solid ground', 'On track', 'Steady build'],
      productive: ['Deep in the work', 'Building, and it shows', 'This is the grind that counts'],
      strained: ['Time to back off', 'Your body has voted', 'Recovery is the session today'],
    },
    frame: {
      veryFresh: ['Ease back in — a session or two and you’ll feel sharp again.', 'You’ve banked the rest. Now put some work back in and feel it come alive.'],
      fresh: ['Good day to ask something of yourself.', 'Legs like this don’t come every day — spend them on something that matters.'],
      neutral: ['Follow the plan. Consistency is what’s building here.', 'Nothing to fix. Show up, do the work, and let the weeks add up.'],
      productive: ['This is what progress feels like from the inside. Keep the easy days easy.', 'Tired is what a good block feels like from the inside. Keep the easy days honest.'],
      strained: ['Take the recovery. You’ll come back stronger for it — that’s not a cliché, it’s the physiology.', 'Give it a day. Fitness doesn’t leave in twenty-four hours, but fatigue can.'],
    },
    hardOnTired: {
      strained: (t) => `${t} is planned, but you’re deep in the red. Move it a day and you’ll get far more out of it.`,
      productive: (t) => `${t} on tired legs. It should still land — just don’t chase numbers in the warm-up.`,
    },
    bodySays: {
      high: (r) => `${r}. Your recovery markers are asking for a day back — take it, and the next block will thank you.`,
      watch: (r, t) => `${r}. ${t} can still happen, but take the intensity down a notch and see how it feels.`,
    },
    restLine: ['Rest day. Take it properly — that’s where the adaptation happens.', 'Nothing planned. Rest well — that’s where the training turns into fitness.', 'Day off. Sleep, eat, and let the body catch up with the work.'],
  },
  {
    id: 'straight',
    label: 'Straight',
    blurb: 'Plain facts, no cheerleading.',
    greeting: (name) => (name ? `${name} —` : 'Today —'),
    headline: {
      veryFresh: ['Very fresh', 'Freshness is high', 'Rested — load is low'],
      fresh: ['Fresh', 'Ready for intensity', 'Form positive'],
      neutral: ['Neutral', 'In balance', 'Load and recovery even'],
      productive: ['Carrying fatigue', 'Fatigue is building', 'In a loading phase'],
      strained: ['Overreached', 'Fatigue is high', 'Load exceeds recovery'],
    },
    frame: {
      veryFresh: ['Fitness is decaying. Add load if you want to hold it.', 'Form this high means load has dropped. Reintroduce it.'],
      fresh: ['Good window for intensity.', 'Intensity will land well today. Schedule it.'],
      neutral: ['Train as planned.', 'No adjustment needed.'],
      productive: ['Normal for a build block. Protect the easy days.', 'Expected for the block. Keep recovery sessions genuinely easy.'],
      strained: ['Reduce load. Recovery, not intensity.', 'Cut load until Form recovers. Intensity now is wasted.'],
    },
    hardOnTired: {
      strained: (t) => `${t} planned on strained legs. Move it or cut it — the quality won’t be there.`,
      productive: (t) => `${t} planned on tired legs. Expect it to feel hard early. That alone isn’t a reason to stop.`,
    },
    bodySays: {
      high: (r) => `${r}. Recovery day — the markers matter more than the plan here.`,
      watch: (r, t) => `${r}. Reduce the intensity of ${t} or move it.`,
    },
    restLine: ['No session planned.', 'Rest day.', 'No load today.'],
  },
  {
    id: 'direct',
    label: 'Direct',
    blurb: 'Tells you what to do, briefly.',
    greeting: () => 'Right.',
    headline: {
      veryFresh: ['Too fresh', 'Rested enough', 'Time to load'],
      fresh: ['Use it', 'Go hard today', 'Spend the freshness'],
      neutral: ['Get on with it', 'Do the session', 'Nothing to overthink'],
      productive: ['Hold the line', 'Stay on it', 'Tired is the plan'],
      strained: ['Stop', 'Back off. Now.', 'Rest, or pay for it'],
    },
    frame: {
      veryFresh: ['You’ve rested enough. Put work back in.', 'Rest is done. Load, or the fitness goes.'],
      fresh: ['Fresh legs are for hard sessions, not easy ones. Use them.', 'Good legs. Don’t waste them on an easy spin.'],
      neutral: ['Nothing to decide. Do the session.', 'Plan says train. Train.'],
      productive: ['Tired is the point. Easy days easy, hard days hard, no blurring.', 'Fatigue is the price. Pay it, keep the easy days easy.'],
      strained: ['You’re digging. Take the day off or go genuinely easy — pick one.', 'Take the day. Or go so easy it barely counts. No middle.'],
    },
    hardOnTired: {
      strained: (t) => `${t} is planned. Don’t do it today. Move it.`,
      productive: (t) => `${t} on tired legs. Do it, but hit the targets or stop — junk intensity helps nobody.`,
    },
    bodySays: {
      high: (r) => `${r}. Not today. Rest.`,
      watch: (r, t) => `${r}. Keep ${t} easy, or don’t bother doing it at all.`,
    },
    restLine: ['Nothing on. Rest, properly.', 'No session. Rest means rest.', 'Day off. Take it, don’t half-take it.'],
  },
  {
    id: 'dark',
    label: 'Dark Night',
    blurb: 'Blunt. No comfort offered.',
    greeting: () => 'Well.',
    headline: {
      veryFresh: ['Rested. Now what?', 'Fresh, and unspent', 'Comfortable is a warning'],
      fresh: ['No excuses today', 'The body is ready. Are you?', 'Nothing left to blame'],
      neutral: ['Average is a choice', 'Nothing special, unless you make it', 'Middle of the road'],
      productive: ['This is the part that counts', 'Everyone else quit here', 'Tired is where it’s decided'],
      strained: ['You went too far', 'The bill has arrived', 'Ego wrote a cheque'],
    },
    frame: {
      veryFresh: ['Freshness you don’t spend is just fitness you lost slowly.', 'Rest without work is just decay with a nicer name.'],
      fresh: ['The legs are there. If today is easy, that was your decision, not your body’s.', 'Today the only limit is what you decide to do with it.'],
      neutral: ['Nobody is coming to make this session more interesting. Do it anyway.', 'Nobody remembers the average days. Make this one count anyway.'],
      productive: ['Everyone trains when it feels good. This is the week that separates you.', 'Feeling tired and doing it anyway is the whole sport.'],
      strained: ['Pushing now is ego, not training. Back off before your body makes the choice for you.', 'Push through this and you’ll lose the week, not just the day.'],
    },
    hardOnTired: {
      strained: (t) => `${t} is on the plan and you’re in no state to do it justice. Doing it anyway is ego, not training.`,
      productive: (t) => `${t} on tired legs. This is the session everyone else finds a reason to skip.`,
    },
    bodySays: {
      high: (r) => `${r}. Train through this and you’ll lose a week instead of a day.`,
      watch: (r, t) => `${r}. Force ${t} today and you’ll pay for it on Thursday.`,
    },
    restLine: ['No session today. Rest is not a reward, it’s a requirement.', 'Nothing today. Rest is a requirement, not a reward.', 'No session. If that bothers you, good — save it for tomorrow.'],
  },
  {
    id: 'nerd',
    label: 'Nerd',
    blurb: 'Data only. No voice at all.',
    greeting: () => '',
    headline: {
      veryFresh: ['TSB high', 'TSB > +20', 'Freshness peak'],
      fresh: ['TSB positive', 'TSB +5 to +20', 'ATL < CTL'],
      neutral: ['TSB neutral', 'TSB −10 to +5', 'ATL ≈ CTL'],
      productive: ['TSB negative', 'ATL > CTL', 'Loading phase'],
      strained: ['TSB deep negative', 'ATL ≫ CTL', 'Overreach threshold crossed'],
    },
    frame: {
      veryFresh: ['CTL decay exceeds ATL decay; net fitness declining.', 'Sustained positive TSB with falling CTL: detraining, not peaking.'],
      fresh: ['ATL below CTL. Intensity tolerance elevated.', 'Supercompensation window. Expect above-baseline output at target intensity.'],
      neutral: ['ATL ≈ CTL. No meaningful freshness signal either way.', 'Acute and chronic load in balance; no adjustment indicated.'],
      productive: ['ATL above CTL, CTL stable or rising. Expected during load accumulation.', 'Overload phase. Monitor sleep and RHR; keep Z1/Z2 sessions in Z1/Z2.'],
      strained: ['ATL well above CTL. Marginal fitness return per additional TSS approaching zero.', 'Functional overreaching range. Recovery days needed to restore TSB above −20.'],
    },
    hardOnTired: {
      strained: (t) => `${t} scheduled below the strained TSB threshold. Expect reduced output and elevated RPE at target intensity.`,
      productive: (t) => `${t} scheduled with ATL above CTL. Session quality usually holds; watch for decay across intervals.`,
    },
    bodySays: {
      high: (r) => `${r}. Autonomic markers and training load both negative — recovery indicated.`,
      watch: (r, t) => `${r}. Reduce prescribed intensity for ${t} until markers return to baseline.`,
    },
    restLine: ['Planned TSS today: 0.', 'Planned TSS today: 0. ATL will decay.', 'No load scheduled. TSB rises.'],
  },
];

export const COACHING_STYLES = STYLE_LIST;

/**
 * A voice's lines for one day. Headlines, frames and the rest line come in
 * two or three versions each; the same one every morning read like a
 * recording, so the day picks — stable for that day and that athlete,
 * different tomorrow. Anything that is not a list passes through untouched.
 */
export function voiceForDay(style, seed = 0) {
  const n = Math.abs(Math.floor(Number(seed) || 0));
  const pick = (v) => (Array.isArray(v) ? v[n % v.length] : v);
  const pickMap = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, pick(v)]));
  return {
    ...style,
    headline: pickMap(style.headline),
    frame: pickMap(style.frame),
    restLine: pick(style.restLine),
  };
}

/** Day-of-year plus a little of the athlete's id, so two athletes differ too. */
export function voiceSeed(now = new Date(), userId = '') {
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  let h = 0;
  for (const ch of String(userId || '')) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return dayOfYear + h;
}

export const COACHING_STYLE_IDS = STYLE_LIST.map((s) => s.id);

export const DEFAULT_COACHING_STYLE = 'supportive';

export function getCoachingStyle(id) {
  return STYLE_LIST.find((s) => s.id === id) || STYLE_LIST.find((s) => s.id === DEFAULT_COACHING_STYLE);
}

/** Slider index ↔ style id, for the 6-stop control. */
export function styleIndex(id) {
  const i = STYLE_LIST.findIndex((s) => s.id === id);
  return i === -1 ? STYLE_LIST.findIndex((s) => s.id === DEFAULT_COACHING_STYLE) : i;
}

export function styleAtIndex(index) {
  const i = Math.max(0, Math.min(STYLE_LIST.length - 1, Number(index) || 0));
  return STYLE_LIST[i];
}
