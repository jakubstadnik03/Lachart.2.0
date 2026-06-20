/**
 * Maps the weekly-summary share payload (from WeeklySummaryCarousel) into the
 * `week` shape expected by WeeklySummaryStories.jsx — see SAMPLE_WEEK there.
 */

import { pickSportKey } from './templates/ShareSportGlyph';

const DAY_KEYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const SPORT_LABELS = {
  bike: 'Cycling',
  run: 'Run / Hike',
  swim: 'Swim',
  strength: 'Strength',
  other: 'Other',
};

function getWeekBounds(refDate) {
  const d = new Date(refDate);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

function getWeekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameLocalDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function actDate(a) {
  return new Date(a?.date || a?.startDate || a?.timestamp || 0);
}

function actSecs(a) {
  return Number(
    a?.totalTime || a?.duration || a?.movingTime || a?.moving_time
    || a?.elapsedTime || a?.elapsed_time || a?.totalTimerTime || 0,
  );
}

function actDist(a) {
  return Number(a?.distance || a?.totalDistance || 0);
}

function actTss(a) {
  return Number(a?.tss || a?.trainingLoad || a?.totalTSS || a?.hrTSS || a?.hrTss || 0);
}

function activityRouteId(a) {
  if (!a) return null;
  return a._id || a.id || a.stravaId || a.stravaActivityId || null;
}

function extractGpsPoints(a) {
  if (!a) return [];
  if (Array.isArray(a.gpsPoints) && a.gpsPoints.length > 1) return a.gpsPoints;
  const latlng = a.streams?.latlng?.data || a.streams?.latlng || a.latlng;
  if (Array.isArray(latlng) && latlng.length > 1) {
    return latlng.filter((p) => Array.isArray(p) && p[0] != null);
  }
  const records = a.records;
  if (Array.isArray(records) && records.length > 1) {
    return records.map((r) => {
      const lat = r.positionLat ?? r.position_lat ?? r.lat ?? r.latitude;
      const lng = r.positionLong ?? r.position_long ?? r.lng ?? r.longitude;
      if (lat == null || lng == null) return null;
      const lt = Math.abs(lat) > 180 ? lat / 11930464.711111111 : lat;
      const ln = Math.abs(lng) > 180 ? lng / 11930464.711111111 : lng;
      return (Math.abs(lt) <= 90 && Math.abs(ln) <= 180) ? [lt, ln] : null;
    }).filter(Boolean);
  }
  return [];
}

function normalizeSportKey(s) {
  const v = String(s || '').toLowerCase();
  if (v.includes('ride') || v.includes('cycle') || v.includes('bike') || v.includes('virtual')) return 'bike';
  if (v.includes('run') || v.includes('walk') || v.includes('hike')) return 'run';
  if (v.includes('swim')) return 'swim';
  return null;
}

function extractThresholds(tests) {
  const out = { bike: null, run: null, swim: null };
  if (!Array.isArray(tests) || !tests.length) return out;
  const bySport = {};
  tests.forEach((t) => {
    if (!t) return;
    const sp = normalizeSportKey(t.sport || t.testType);
    if (!sp) return;
    if (!bySport[sp]) bySport[sp] = [];
    bySport[sp].push(t);
  });
  Object.keys(bySport).forEach((sp) => {
    bySport[sp].sort((a, b) => new Date(b?.date || b?.testDate || 0) - new Date(a?.date || a?.testDate || 0));
    const t = bySport[sp][0];
    if (!t) return;
    const ov = t.thresholdOverrides || {};
    const ltp2 = Number(ov.LTP2) || null;
    out[sp] = {
      lt2Power: sp === 'bike' ? ltp2 : null,
      lt2Pace: sp !== 'bike' ? ltp2 : null,
      lt2Hr: Number(ov.LTP2_hr) || null,
    };
    if (Array.isArray(t.results)) {
      const stage = t.results.find((r) => Number(r.lactate) >= 4);
      if (stage) {
        if (sp === 'bike' && !out[sp].lt2Power) {
          out[sp].lt2Power = Number(stage.power) || Number(stage.interval) || null;
        } else if (sp !== 'bike' && !out[sp].lt2Pace) {
          out[sp].lt2Pace = Number(stage.interval) || Number(stage.pace) || null;
        }
        out[sp].lt2Hr = out[sp].lt2Hr || Number(stage.heartRate) || null;
      }
    }
  });
  return out;
}

function computeActivityTSS(a, thresholds) {
  if (!a) return 0;
  const sport = normalizeSportKey(a.sport || a.type);
  const secs = actSecs(a);
  if (!sport || secs <= 0) return 0;
  const th = thresholds?.[sport];
  if (sport === 'bike') {
    const np = Number(a.weightedAveragePower || a.normalizedPower || a.avgPower || a.averagePower || a.average_watts || 0);
    const ftp = Number(th?.lt2Power || 0);
    if (np > 0 && ftp > 0) return Math.round((secs * np * np) / (ftp * ftp * 3600) * 100);
    const avgHr = Number(a.avgHeartRate || a.averageHeartRate || a.average_heartrate || 0);
    const lthr = Number(th?.lt2Hr || 0);
    if (avgHr > 0 && lthr > 0) {
      const ratio = avgHr / lthr;
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
  }
  if (sport === 'run' || sport === 'swim') {
    const speed = Number(a.avgSpeed || a.averageSpeed || a.average_speed || 0);
    const refPace = Number(th?.lt2Pace || 0);
    if (speed > 0 && refPace > 0) {
      const unit = sport === 'swim' ? 100 : 1000;
      const avgPace = unit / speed;
      const ratio = refPace / avgPace;
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
    const avgHr = Number(a.avgHeartRate || a.averageHeartRate || a.average_heartrate || 0);
    const lthr = Number(th?.lt2Hr || 0);
    if (avgHr > 0 && lthr > 0) {
      const ratio = avgHr / lthr;
      return Math.round((secs * ratio * ratio) / 3600 * 100);
    }
  }
  return 0;
}

function tssOrCompute(a, thresholds) {
  const stored = actTss(a);
  if (stored > 0) return stored;
  return computeActivityTSS(a, thresholds);
}

function tssForActivity(a, dayActs, dayTssTotal, thresholds) {
  const direct = tssOrCompute(a, thresholds);
  if (direct > 0) return direct;
  if (dayTssTotal <= 0 || !dayActs?.length) return 0;
  if (dayActs.length === 1) return dayTssTotal;
  const totalSecs = dayActs.reduce((s, x) => s + actSecs(x), 0);
  if (totalSecs <= 0) return 0;
  return Math.round(dayTssTotal * (actSecs(a) / totalSecs));
}

function fmtDuration(secs) {
  if (!secs) return '0m';
  const totalMin = Math.max(0, Math.round(secs / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function fmtDistKm(m) {
  const km = (m || 0) / 1000;
  if (km <= 0) return '0.0';
  return km >= 100 ? `${Math.round(km)}` : km.toFixed(1);
}

function fmtDistSession(m) {
  const km = (m || 0) / 1000;
  if (km <= 0) return '';
  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

function fmtMovingTimeH(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function isoWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function dayKeyForDate(d) {
  return DAY_KEYS[(d.getDay() + 6) % 7];
}

function buildSparkMap(sparklineData) {
  const map = {};
  for (const pt of sparklineData || []) {
    if (pt?.date) map[String(pt.date).slice(0, 10)] = pt;
  }
  return map;
}

function weekKpis(sparkByDate, monday, sunday, fallbackKpis) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const cutoff = sunday < today ? sunday : today;
  let endSnap = null;
  for (let i = 0; i < 14; i++) {
    const probe = new Date(cutoff);
    probe.setDate(cutoff.getDate() - i);
    const s = sparkByDate[dateKey(probe)];
    if (s) { endSnap = s; break; }
  }
  if (endSnap) {
    return {
      fitness: Math.round(endSnap.Fitness || endSnap.fitness || 0),
      fatigue: Math.round(endSnap.Fatigue || endSnap.fatigue || 0),
      form: Math.round(endSnap.Form ?? endSnap.form ?? 0),
    };
  }
  if (fallbackKpis) {
    return {
      fitness: Math.round(fallbackKpis.fitness || 0),
      fatigue: Math.round(fallbackKpis.fatigue || 0),
      form: Math.round(fallbackKpis.form ?? 0),
    };
  }
  return { fitness: 0, fatigue: 0, form: 0 };
}

function dayTssForDate(d, sparkByDate, weekActs, thresholds) {
  const key = dateKey(d);
  const spark = sparkByDate[key];
  if (spark?.TSS != null && Number(spark.TSS) > 0) return Math.round(Number(spark.TSS));
  return Math.round(
    weekActs
      .filter((a) => isSameLocalDay(actDate(a), d))
      .reduce((s, a) => s + tssOrCompute(a, thresholds), 0),
  );
}

function buildDays(weekDays, weekActs, sparkByDate, thresholds) {
  return weekDays.map((d, i) => {
    const dayActs = weekActs
      .filter((a) => isSameLocalDay(actDate(a), d))
      .sort((a, b) => actDate(a) - actDate(b));
    const dayTss = dayTssForDate(d, sparkByDate, weekActs, thresholds);
    const sessions = dayActs.map((a) => ({
      sport: pickSportKey(a.sport || a.type),
      title: a.title || a.name || a.titleManual || 'Activity',
      dur: fmtDuration(actSecs(a)),
      dist: fmtDistSession(actDist(a)),
      tss: tssForActivity(a, dayActs, dayTss, thresholds),
    }));
    return {
      key: DAY_KEYS[i],
      date: String(d.getDate()),
      tss: dayTss,
      sessions,
    };
  });
}

function buildSports(weekActs) {
  const buckets = {};
  for (const a of weekActs) {
    const key = pickSportKey(a.sport || a.type);
    if (!buckets[key]) buckets[key] = { sport: key, min: 0, dist: 0, acts: 0 };
    buckets[key].min += Math.round(actSecs(a) / 60);
    buckets[key].dist += actDist(a);
    buckets[key].acts += 1;
  }
  return Object.values(buckets)
    .filter((b) => b.min > 0 || b.acts > 0)
    .sort((a, b) => b.min - a.min)
    .map((b) => ({
      sport: b.sport,
      label: SPORT_LABELS[b.sport] || SPORT_LABELS.other,
      min: b.min,
      time: fmtDuration(b.min * 60),
      dist: b.dist > 0 ? `${fmtDistKm(b.dist)} km` : '—',
      acts: b.acts,
    }));
}

function buildTop(weekActs, sparkByDate, thresholds) {
  if (!weekActs.length) {
    return {
      sport: 'run',
      title: 'No sessions',
      day: '',
      badge: 'Top TSS this week',
      stats: [
        { label: 'Distance', value: '0', unit: 'km' },
        { label: 'Moving time', value: '0:00', unit: 'h' },
        { label: 'TSS', value: '0', unit: '' },
      ],
    };
  }
  const ranked = weekActs.map((a) => {
    const d = actDate(a);
    const dayActs = weekActs.filter((x) => isSameLocalDay(actDate(x), d));
    const dayTss = dayTssForDate(d, sparkByDate, weekActs, thresholds);
    return {
      act: a,
      tss: tssForActivity(a, dayActs, dayTss, thresholds),
      secs: actSecs(a),
      dist: actDist(a),
    };
  });

  const withTss = ranked.filter((r) => r.tss > 0).sort((a, b) => b.tss - a.tss || b.secs - a.secs);
  const pick = withTss.length
    ? withTss[0]
    : [...ranked].sort((a, b) => b.dist - a.dist || b.secs - a.secs)[0];

  const top = pick.act;
  const topTss = pick.tss;
  const d = actDate(top);
  const dayLabel = d.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
  const secs = actSecs(top);
  const distM = actDist(top);
  const sport = pickSportKey(top.sport || top.type);
  const stats = [];
  if (topTss > 0) {
    stats.push({ label: 'TSS', value: String(Math.round(topTss)), unit: '' });
  }
  stats.push(
    { label: 'Distance', value: fmtDistKm(distM), unit: 'km' },
    { label: 'Moving time', value: fmtMovingTimeH(secs), unit: 'h' },
  );
  if (topTss <= 0) {
    stats.push({ label: 'TSS', value: '0', unit: '' });
  }
  if (secs > 0 && distM > 0) {
    const kmh = (distM / 1000) / (secs / 3600);
    stats.push({ label: 'Avg speed', value: kmh.toFixed(1), unit: 'km/h' });
  }
  const elev = Number(top.totalElevationGain || top.elevation || top.elev_gain || 0);
  if (elev > 0) stats.push({ label: 'Elevation', value: Math.round(elev).toLocaleString('en'), unit: 'm' });
  const hr = Number(top.avgHeartRate || top.averageHeartRate || top.average_heartrate || 0);
  if (hr > 0) stats.push({ label: 'Avg HR', value: String(Math.round(hr)), unit: 'bpm' });
  return {
    sport,
    title: top.title || top.name || top.titleManual || 'Activity',
    day: dayLabel,
    badge: topTss > 0 ? 'Top TSS this week' : 'Longest session',
    stats,
    activityId: activityRouteId(top),
    gpsPoints: extractGpsPoints(top),
  };
}

function buildLoadGrid(monday, sparkByDate, allActivities, thresholds) {
  const grid = [];
  for (let w = 3; w >= 0; w--) {
    const ref = new Date(monday);
    ref.setDate(monday.getDate() - w * 7);
    const { monday: wMon } = getWeekBounds(ref);
    const row = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(wMon);
      d.setDate(wMon.getDate() + i);
      row.push(dayTssForDate(d, sparkByDate, allActivities, thresholds));
    }
    grid.push(row);
  }
  return grid;
}

function buildStreak(monday, sunday, weekActs, allActivities, weekStreak) {
  const activeDays = getWeekDays(monday).filter((d) =>
    weekActs.some((a) => isSameLocalDay(actDate(a), d)),
  ).length;

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const end = sunday < today ? sunday : today;
  let last28Active = 0;
  for (let i = 0; i < 28; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    if (allActivities.some((a) => isSameLocalDay(actDate(a), d))) last28Active += 1;
  }

  return {
    activeDays,
    weekStreak: weekStreak || 0,
    last28Active,
    last28: 28,
  };
}

function parseStepX(r, isPace) {
  if (isPace) {
    if (typeof r?.power === 'string') {
      const m = r.power.match(/^(\d+):(\d{2})$/);
      if (m) return Number(m[1]) * 60 + Number(m[2]);
    }
    return Number(r?.power ?? r?.interval ?? 0) || null;
  }
  return Number(r?.power ?? r?.interval ?? 0) || null;
}

function buildLactate(tests, monday, sunday, allTests) {
  const inWeek = (tests || []).filter((t) => {
    if (!t) return false;
    const d = new Date(t.date || t.testDate || 0);
    return d >= monday && d <= sunday;
  });
  if (!inWeek.length) return null;

  const test = inWeek.sort((a, b) =>
    new Date(b.date || b.testDate || 0) - new Date(a.date || a.testDate || 0),
  )[0];
  const results = Array.isArray(test.results) ? test.results : [];
  if (results.length < 2) return null;

  const sport = String(test.sport || test.testType || '').toLowerCase();
  const isPace = sport.includes('run') || sport.includes('swim');
  const sportKey = pickSportKey(sport);

  const steps = results
    .map((r) => {
      const x = parseStepX(r, isPace);
      const lac = Number(String(r?.lactate ?? r?.lactateValue ?? r?.mmol ?? '').replace(',', '.'));
      const hr = Number(String(r?.heartRate ?? r?.hr ?? '').replace(',', '.'));
      if (!Number.isFinite(x) || !Number.isFinite(lac)) return null;
      return { x, lac, hr: Number.isFinite(hr) ? hr : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => (isPace ? b.x - a.x : a.x - b.x));

  if (steps.length < 2) return null;

  const ov = test.thresholdOverrides || {};
  const lt1X = Number(ov.LTP1 ?? ov.lt1 ?? 0) || null;
  const lt2X = Number(ov.LTP2 ?? ov.lt2 ?? 0) || null;
  const lt1Lac = Number(ov.LTP1_lactate ?? 0) || 1.4;
  const lt2Lac = Number(ov.LTP2_lactate ?? 0) || 4.0;
  const lt1Hr = Number(ov.LTP1_hr ?? 0) || 0;
  const lt2Hr = Number(ov.LTP2_hr ?? 0) || 0;

  const testDay = new Date(test.date || test.testDate || 0);
  const dayKey = dayKeyForDate(testDay);
  const dayLabel = testDay.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });

  let deltaLt2;
  const prev = (allTests || [])
    .filter((t) => t && t !== test && pickSportKey(t.sport || t.testType) === sportKey)
    .filter((t) => new Date(t.date || t.testDate || 0) < testDay)
    .sort((a, b) => new Date(b.date || b.testDate) - new Date(a.date || a.testDate))[0];
  if (prev && lt2X) {
    const prevLt2 = Number(prev.thresholdOverrides?.LTP2 ?? prev.thresholdOverrides?.lt2 ?? 0);
    if (prevLt2 > 0) {
      const diff = Math.round(lt2X - prevLt2);
      if (diff !== 0) deltaLt2 = `${diff > 0 ? '+' : ''}${diff} ${isPace ? 's/km' : 'W'}`;
    }
  }

  return {
    day: dayLabel,
    dayKey,
    sport: sportKey,
    protocol: test.protocol || test.notes || (isPace ? 'Step test' : '4-min steps'),
    xUnit: isPace ? 's/km' : 'W',
    xLabel: isPace ? 'Pace' : 'Power',
    steps,
    lt1: {
      label: 'LT1',
      sub: 'Aerobic',
      x: lt1X || steps[Math.floor(steps.length * 0.35)]?.x || steps[0].x,
      hr: lt1Hr || steps[Math.floor(steps.length * 0.35)]?.hr || 0,
      lac: lt1Lac,
    },
    lt2: {
      label: 'LT2',
      sub: 'Anaerobic · 4 mmol',
      x: lt2X || steps[Math.floor(steps.length * 0.7)]?.x || steps[steps.length - 1].x,
      hr: lt2Hr || steps[Math.floor(steps.length * 0.7)]?.hr || 0,
      lac: lt2Lac,
    },
    ...(deltaLt2 ? { deltaLt2 } : {}),
  };
}

/**
 * @param {object} summary — payload from WeeklySummaryCarousel shareSummary
 */
export function toWeek(summary = {}) {
  const monday = summary.monday ? new Date(summary.monday) : getWeekBounds(new Date()).monday;
  const sunday = summary.sunday ? new Date(summary.sunday) : getWeekBounds(new Date()).sunday;
  const weekDays = getWeekDays(monday);
  const weekActs = summary.activities || summary.workouts?.map((w) => ({ ...w, done: true })) || [];
  const allActivities = summary.allActivities || weekActs;
  const sparkByDate = buildSparkMap(summary.sparklineData);
  const thresholds = extractThresholds(summary.tests);

  const totalsRaw = summary.totals || {};
  const totalSecs = Number(totalsRaw.secs) || weekActs.reduce((s, a) => s + actSecs(a), 0);
  const totalDist = Number(totalsRaw.distM) || weekActs.reduce((s, a) => s + actDist(a), 0);
  const totalTss = Number(totalsRaw.tss) || weekDays.reduce(
    (s, d) => s + dayTssForDate(d, sparkByDate, weekActs, thresholds), 0,
  );

  const rangeLabel = summary.subtitle
    || `${monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en', { month: 'short', day: 'numeric' })}`;
  const rangeShort = summary.rangeShort
    || `${monday.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – ${sunday.getDate()}`;

  const days = buildDays(weekDays, weekActs, sparkByDate, thresholds);
  const sports = buildSports(weekActs);
  const lactate = buildLactate(summary.tests, monday, sunday, summary.allTests || summary.tests);

  return {
    rangeLabel,
    rangeShort,
    weekNo: isoWeekNumber(monday),
    handle: summary.handle || 'lachart.net',
    kpis: weekKpis(sparkByDate, monday, sunday, summary.kpis),
    totals: {
      activities: Number(totalsRaw.count) || weekActs.length,
      time: fmtDuration(totalSecs),
      distance: fmtDistKm(totalDist),
      distanceUnit: 'km',
      tss: Math.round(totalTss),
    },
    days,
    sports,
    top: buildTop(weekActs, sparkByDate, thresholds),
    streak: buildStreak(monday, sunday, weekActs, allActivities, summary.streak),
    loadGrid: buildLoadGrid(monday, sparkByDate, allActivities, thresholds),
    lactate,
  };
}
