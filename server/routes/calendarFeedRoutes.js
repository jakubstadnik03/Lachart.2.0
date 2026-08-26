/**
 * Training-calendar ICS feed
 * ──────────────────────────
 * Lets athletes see their planned workouts (with the lap/step breakdown) in
 * Apple Calendar, Google Calendar, Outlook — anything that can subscribe to a
 * webcal/https ICS URL:
 *
 *   GET  /api/calendar-feed/token           (auth)  → { url, webcalUrl }
 *   POST /api/calendar-feed/token/rotate    (auth)  → new token (old URL dies)
 *   GET  /api/calendar-feed/:token/lachart.ics      → the feed (token = auth)
 *
 * Calendar apps poll the URL themselves (Apple: configurable, default ~1 day;
 * we advertise a 1-hour TTL), so a newly planned workout appears without any
 * push from us. Events are all-day — planned workouts carry a date, not a
 * start time.
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const PlannedWorkout = require('../models/PlannedWorkout');
const {
  expandSteps,
  resolveTargetWatts,
  resolveTargetPaceSecPerKm,
  resolveTargetSwimPaceSecPer100m,
} = require('../utils/workoutExporters');

const SPORT_LABEL = {
  run: 'Run', bike: 'Ride', mtbike: 'MTB', swim: 'Swim', strength: 'Strength',
  gym: 'Strength', walk: 'Walk', brick: 'Brick', crosstrain: 'Cross-training',
  rowing: 'Rowing', lactate: 'Lactate test', other: 'Workout',
};

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return 'https://lachart.onrender.com';
  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${protocol}://${host}`;
}

function feedUrls(req, token) {
  const base = publicBaseUrl(req);
  const url = `${base}/api/calendar-feed/${token}/lachart.ics`;
  return { url, webcalUrl: url.replace(/^https?:\/\//, 'webcal://') };
}

/** GET /api/calendar-feed/token — return (creating if needed) this user's feed URL. */
router.get('/token', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('calendarFeedToken');
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.calendarFeedToken) {
      user.calendarFeedToken = crypto.randomBytes(24).toString('hex');
      await user.save();
    }
    res.json(feedUrls(req, user.calendarFeedToken));
  } catch (e) {
    console.error('[calendar-feed] token error:', e.message);
    res.status(500).json({ error: 'Failed to create calendar feed' });
  }
});

/** POST /api/calendar-feed/token/rotate — new secret; previously shared URLs stop working. */
router.post('/token/rotate', verifyToken, async (req, res) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: { calendarFeedToken: token } },
      { new: true }
    ).select('calendarFeedToken');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(feedUrls(req, token));
  } catch (e) {
    console.error('[calendar-feed] rotate error:', e.message);
    res.status(500).json({ error: 'Failed to rotate calendar feed token' });
  }
});

/* ────────────────────────── ICS generation ────────────────────────── */

/** RFC 5545 text escaping. */
function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Fold long lines at 74 octets with a leading space (RFC 5545 §3.1). */
function icsFold(line) {
  if (Buffer.byteLength(line, 'utf8') <= 74) return line;
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > (out.length ? 73 : 74)) {
      out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out.join('\r\n ');
}

function icsDate(d) {
  return new Date(d).toISOString().slice(0, 10).replace(/-/g, '');
}

function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
}

function fmtPace(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtMeters(m) {
  if (m >= 1000) {
    const km = m / 1000;
    return km === Math.floor(km) ? `${km} km` : `${km.toFixed(1)} km`;
  }
  return `${m} m`;
}

/** One line per lap: "3. 1 km work @ 4:15/km" / "3. 8min work @ ~240 W". */
function stepLines(pw, ctx) {
  const steps = expandSteps(pw.steps || []);
  const paceSport = pw.sport === 'run' || pw.sport === 'walk' ? 'run'
    : pw.sport === 'swim' ? 'swim' : null;
  return steps.map((s, i) => {
    const meters = Math.round(Number(s.distanceMeters) || 0);
    const size = s.durationType === 'distance' && meters > 0
      ? fmtMeters(meters)
      : fmtDur(Math.max(1, Number(s.durationSeconds) || 0));
    const label = s.label || s.stepType || 'step';
    let target = '';
    if (paceSport) {
      const pace = paceSport === 'swim'
        ? resolveTargetSwimPaceSecPer100m(s.powerTarget, ctx)
        : resolveTargetPaceSecPerKm(s.powerTarget, ctx);
      if (pace > 0) target = ` @ ${fmtPace(pace)}${paceSport === 'swim' ? '/100m' : '/km'}`;
    } else {
      const w = resolveTargetWatts(s.powerTarget, ctx);
      if (w != null) target = ` @ ~${w} W`;
    }
    return `${i + 1}. ${size} ${label}${target}`;
  });
}

function buildEvent(pw, ctx, now) {
  const sport = SPORT_LABEL[pw.sport] || 'Workout';
  const totalSec = expandSteps(pw.steps || [])
    .reduce((a, s) => a + (Number(s.durationSeconds) || 0), 0)
    || Number(pw.plannedDuration) || 0;
  const durText = totalSec > 0 ? ` (${fmtDur(totalSec)})` : '';
  const status = pw.status === 'completed' ? ' ✓' : pw.status === 'skipped' ? ' (skipped)' : '';
  const summary = `${sport}: ${pw.title || 'Workout'}${durText}${status}`;

  const descParts = [];
  if (pw.description) descParts.push(pw.description);
  const laps = Array.isArray(pw.steps) && pw.steps.length ? stepLines(pw, ctx) : [];
  if (laps.length) descParts.push(['Laps:', ...laps].join('\n'));
  if (pw.coachNotes) descParts.push(`Coach: ${pw.coachNotes}`);

  const start = icsDate(pw.date);
  const endDate = new Date(pw.date);
  endDate.setDate(endDate.getDate() + 1);

  return [
    'BEGIN:VEVENT',
    `UID:${pw._id}@lachart`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${icsDate(endDate)}`,
    icsFold(`SUMMARY:${icsEscape(summary)}`),
    ...(descParts.length ? [icsFold(`DESCRIPTION:${icsEscape(descParts.join('\n\n'))}`)] : []),
    ...(pw.status === 'skipped' ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT',
  ];
}

/**
 * GET /api/calendar-feed/:token/lachart.ics
 * No auth header — the unguessable token is the credential. Read-only.
 */
router.get('/:token/lachart.ics', async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).send('Not found');
    const user = await User.findOne({ calendarFeedToken: token }).select('_id powerZones').lean();
    if (!user) return res.status(404).send('Not found');

    const from = new Date();
    from.setDate(from.getDate() - 60);
    const to = new Date();
    to.setDate(to.getDate() + 366);

    const workouts = await PlannedWorkout.find({
      athleteId: String(user._id),
      date: { $gte: from, $lte: to },
    }).sort({ date: 1 }).lean();

    // Watts in descriptions use the same FTP/LT context as the file exports.
    let ctx = { ftp: 250, lt1Power: null, lt2Power: null };
    try {
      const Test = require('../models/test');
      const tests = await Test.find({ userId: String(user._id) }).sort({ date: -1 }).limit(10).lean();
      const latest = tests.find((t) => t.lt2Power || t.ltPower || t.ftp);
      if (latest) {
        ctx = {
          ftp: Number(latest.lt2Power || latest.ltPower || latest.ftp) || 250,
          lt1Power: latest.ltPower || latest.lt1Power || null,
          lt2Power: latest.lt2Power || latest.ltPower || null,
        };
      }
    } catch (_) { /* keep defaults */ }
    // Pace context for run/swim lap lines — same zones the builder resolves against.
    if (user.powerZones?.running) {
      ctx.runningZones = user.powerZones.running;
      ctx.lt1Pace = user.powerZones.running.lt1 || null;
      ctx.lt2Pace = user.powerZones.running.lt2 || null;
    }
    if (user.powerZones?.swimming) {
      ctx.swimmingZones = user.powerZones.swimming;
      ctx.lt1Swim = user.powerZones.swimming.lt1 || null;
      ctx.lt2Swim = user.powerZones.swimming.lt2 || null;
    }

    const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LaChart//Training Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:LaChart Training',
      'X-WR-CALDESC:Planned workouts from LaChart',
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
      ...workouts.flatMap((pw) => buildEvent(pw, ctx, now)),
      'END:VCALENDAR',
    ];

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(lines.join('\r\n') + '\r\n');
  } catch (e) {
    console.error('[calendar-feed] ics error:', e.message);
    res.status(500).send('Feed error');
  }
});

module.exports = router;
