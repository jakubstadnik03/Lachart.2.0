/**
 * A session typed the way a coach writes it on a whiteboard, turned into
 * builder steps:
 *
 *   15min WU, 4x10min LT2 2min rec, 10min CD
 *   5x3min build, 5min easy, 3x(8min LT1 + 3min Z1), 10min cooldown
 *   400m easy / 8x100m Z5 30s rest / 200m CD
 *
 * Pure: no React, no context. A ramp ("build") comes back as a spec for the
 * builder to materialise with the athlete's thresholds, and a distance step
 * comes back as metres for the builder to estimate a time for. Anything the
 * grammar cannot place is reported in `warnings`, never silently dropped.
 */

const DUR = String.raw`(\d+(?:[.,]\d+)?)\s*(h|hod|hr|hrs|hours?|min|mins|minutes?|m(?![a-z])|'|s|sec|secs|seconds?|")`;
const CLOCK = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?`;
const DIST = String.raw`(\d+(?:[.,]\d+)?)\s*(km|k(?![a-z])|m(?![a-z])|meters?|metres?|mi|miles?)`;

/** "15min", "1h30", "1:30", "90s", "15'" → seconds; null when it is not a time. */
function parseTime(text) {
  const t = String(text).trim().toLowerCase();
  let m = t.match(new RegExp(`^${CLOCK}$`));
  if (m) {
    const [, a, b, c] = m;
    return c != null ? Number(a) * 3600 + Number(b) * 60 + Number(c) : Number(a) * 60 + Number(b);
  }
  m = t.match(/^(\d+)\s*h\s*(\d{1,2})$/);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60;
  m = t.match(new RegExp(`^${DUR}$`));
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  const u = m[2];
  if (/^(h|hod|hr|hrs|hour|hours)$/.test(u)) return Math.round(n * 3600);
  if (/^(s|sec|secs|second|seconds|")$/.test(u)) return Math.round(n);
  // A bare "m" is minutes in coach shorthand ("10m WU") and metres in the
  // pool ("400m"): nobody plans four hundred minutes, so the number decides.
  if (u === 'm' && n >= 50) return null;
  return Math.round(n * 60);
}

/** "400m", "2km", "1.5 km" → metres; null otherwise. */
function parseDistance(text) {
  const m = String(text).trim().toLowerCase().match(new RegExp(`^${DIST}$`));
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  const u = m[2];
  if (/^(km|k)$/.test(u)) return Math.round(n * 1000);
  if (/^(mi|mile|miles)$/.test(u)) return Math.round(n * 1609.34);
  if (u === 'm' && n < 50) return null; // that was minutes
  return Math.round(n);
}

/**
 * What a word says about intensity. Order matters: "cool down" must not read
 * as "down", "sweet spot" before "ss".
 */
const INTENSITY = [
  { re: /^(wu|warm-?up|warmup|rozjezd|rozjeti|rozjetí|rozcvic\S*|rozcvič\S*|zahrat\S*|zahřát\S*)$/, kind: 'warmup' },
  { re: /^(cd|cool-?down|cooldown|vyjet\S*|vyjeti|vyjetí|vyklus\S*|zklidn\S*)$/, kind: 'cooldown' },
  { re: /^(build|ramp|navys\S*|navyš\S*|progres\S*|stupnov\S*|stupňov\S*)$/, kind: 'build' },
  { re: /^(rest|pauza|pause|stop|off)$/, kind: 'rest' },
  { re: /^(rec|recovery|recov\S*|easy|lehce|lehky|lehký|volne|volně|odpoc\S*|odpoč\S*|klid\S*|jog|spin)$/, kind: 'recovery' },
  { re: /^(lt1|aet|aerobic)$/, target: { type: 'lt1' } },
  { re: /^(lt2|ftp|threshold|thr|prah|prahov\S*|ant)$/, target: { type: 'lt2' } },
  { re: /^(tempo)$/, target: { type: 'zone', value: 3 } },
  { re: /^(endurance|endur\S*|vytrval\S*|steady|aerob)$/, target: { type: 'zone', value: 2 } },
  { re: /^(vo2|vo2max|v02|v02max|max)$/, target: { type: 'zone', value: 5 } },
  { re: /^(sprint\S*|anaerob\S*|neuro\S*)$/, target: { type: 'zone', value: 5 } },
  { re: /^(ss|sweetspot|sweet-spot)$/, target: { type: 'percent_ftp', value: 90 } },
  { re: /^z([1-7])$/, target: (m) => ({ type: 'zone', value: Math.min(5, Number(m[1])) }) },
  { re: /^zone([1-7])$/, target: (m) => ({ type: 'zone', value: Math.min(5, Number(m[1])) }) },
  { re: /^(\d{2,3})%(ftp)?$/, target: (m) => ({ type: 'percent_ftp', value: Number(m[1]) }) },
  { re: /^(\d{2,4})w$/, target: (m) => ({ type: 'watts', value: Number(m[1]) }) },
];

/** Words that carry nothing: connectors and units we already used. */
const NOISE = /^(a|and|at|@|x|×|of|the|na|v|ve|s|se|po|then|pak|potom|sweet|spot|zone|zona|zóna|reps?|rep|interval\S*|intervaly|series?|serie|set|sets|between|mezi|each|kazd\S*|každ\S*|in|with)$/;

function classify(words) {
  let kind = null;
  let target = null;
  const unknown = [];
  let pending = null; // "sweet" waiting for "spot", "warm" for "up"
  for (const raw of words) {
    const w = raw.toLowerCase().replace(/[()[\],;:]/g, '');
    if (!w) continue;
    const joined = pending ? `${pending}${w}` : null;
    pending = null;
    const candidates = joined ? [joined, w] : [w];
    let hit = false;
    for (const c of candidates) {
      for (const rule of INTENSITY) {
        const m = c.match(rule.re);
        if (!m) continue;
        if (rule.kind) kind = kind || rule.kind;
        if (rule.target) target = target || (typeof rule.target === 'function' ? rule.target(m) : rule.target);
        hit = true;
        break;
      }
      if (hit) break;
    }
    if (hit) continue;
    if (/^(warm|cool|sweet)$/.test(w)) { pending = w; continue; }
    if (/^(up|down)$/.test(w)) continue; // half of "warm up" / "cool down" already handled
    if (NOISE.test(w)) continue;
    if (/^(to|do|->|→|až)$/.test(w)) continue; // "Z1 to Z3" on a build
    unknown.push(raw);
  }
  return { kind, target, unknown };
}

/**
 * Split one member's text into its duration/distance and the words around it.
 * The quantity can come first ("10min LT2") or last ("LT2 10min").
 */
const QTY = new RegExp(`(?:${CLOCK}|\\d+\\s*h\\s*\\d{1,2}|${DUR}|${DIST})`, 'gi');

function splitMembers(text) {
  // Members start at each quantity; words before the first quantity belong
  // to the first member ("LT2 10min 2min rec" → [LT2 10min] [2min rec]).
  const members = [];
  const qtys = [...text.matchAll(QTY)];
  if (!qtys.length) return [{ text, qty: null }];
  qtys.forEach((q, i) => {
    const start = i === 0 ? 0 : q.index;
    const end = i + 1 < qtys.length ? qtys[i + 1].index : text.length;
    members.push({ text: text.slice(start, end), qty: q[0] });
  });
  return members;
}

function memberToStep(member, inRepeat, warnings) {
  const secs = member.qty ? parseTime(member.qty) : null;
  const metres = member.qty && secs == null ? parseDistance(member.qty) : null;
  const words = member.text.replace(member.qty || '', ' ').split(/\s+/).filter(Boolean);
  const { kind, target, unknown } = classify(words);
  if (unknown.length) warnings.push(`Did not understand “${unknown.join(' ')}”`);

  if (kind === 'build') {
    return { build: true, secs, metres, target };
  }
  let stepType = kind || 'work';
  // Inside a repeat, a Z1 member is the recovery between the efforts.
  if (!kind && inRepeat && target?.type === 'zone' && target.value === 1) stepType = 'recovery';
  if (!kind && !target) {
    // "10min" on its own: an easy stretch when it sits between efforts, a
    // Z2 effort otherwise.
    stepType = inRepeat ? 'recovery' : 'work';
  }
  let powerTarget = target;
  if (!powerTarget) {
    if (stepType === 'rest') powerTarget = { type: 'open' };
    else if (stepType === 'warmup' || stepType === 'cooldown' || stepType === 'recovery') powerTarget = { type: 'zone', value: 1 };
    else {
      powerTarget = { type: 'zone', value: 2 };
      warnings.push(`No intensity for “${member.text.trim()}” — set to Z2`);
    }
  }
  if (secs == null && metres == null) {
    warnings.push(`No duration for “${member.text.trim()}” — skipped`);
    return null;
  }
  const step = { stepType, powerTarget };
  if (metres != null) { step.durationType = 'distance'; step.distanceMeters = metres; }
  else step.durationSeconds = secs;
  return step;
}

/** Top-level pieces: newlines, commas, semicolons, slashes, "then". Parentheses stay whole. */
function splitSegments(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  const t = text.replace(/\bthen\b|\bpak\b|\bpotom\b/gi, ',');
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[\n,;/]/.test(ch)) { flush(); continue; }
    cur += ch;
  }
  flush();
  return out;
}

/**
 * @param {string} text
 * @returns {{ items: Array, warnings: string[] }}
 *   items: { step } | { repeat, members: step[] } | { build: { count, secs, metres, target } }
 */
export function parseWorkoutText(text) {
  const warnings = [];
  const items = [];
  const src = String(text || '').replace(/×/g, 'x').replace(/’/g, "'");
  if (!src.trim()) return { items, warnings };

  for (const seg of splitSegments(src)) {
    // Repeat prefix: "4x", "4 x", "4x(" … the rest is the cycle.
    const rep = seg.match(/^\s*(\d+)\s*x\s*(.*)$/i);
    const reps = rep ? Number(rep[1]) : 1;
    let body = rep ? rep[2] : seg;
    body = body.trim().replace(/^\((.*)\)$/s, '$1');
    const memberTexts = body.split(/\s\+\s|\s\+|\+\s/).map((m) => m.trim()).filter(Boolean);
    const members = memberTexts.flatMap(splitMembers);
    const steps = members.map((m) => memberToStep(m, reps > 1, warnings)).filter(Boolean);
    if (!steps.length) continue;

    const build = steps.find((s) => s.build);
    if (build) {
      // "5x3min build" → five steps of three minutes; "15min build" → five of three.
      const count = reps > 1 ? reps : 5;
      const secs = build.secs != null ? build.secs : null;
      items.push({ build: { count, secs: reps > 1 ? secs : (secs != null ? Math.round(secs / count) : null), metres: build.metres, to: build.target || null } });
      continue;
    }
    if (reps > 1) items.push({ repeat: reps, members: steps });
    else steps.forEach((step) => items.push({ step }));
  }
  return { items, warnings };
}

export default parseWorkoutText;
