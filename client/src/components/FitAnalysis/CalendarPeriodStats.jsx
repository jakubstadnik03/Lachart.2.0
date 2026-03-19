import React, { useMemo, useState } from 'react';
import EChartsModule from 'echarts-for-react';
import { formatDuration, formatDistance } from '../../utils/fitAnalysisUtils';

const ReactECharts = EChartsModule?.default ?? EChartsModule;

const ZONE_KEYS = ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'];
const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];
const PROFILE_SPORTS = ['cycling', 'running', 'swimming'];
const SPORT_LABEL = { cycling: 'Bike', running: 'Run', swimming: 'Swim' };
const SPORT_STACK_COLOR = { cycling: '#3b82f6', running: '#f97316', swimming: '#06b6d4' };

// Zone palette (roughly aligned with the app styling)
const POWER_ZONE_FILL = ['#7dd3fc', '#38bdf8', '#0ea5e9', '#0369a1', '#082f49']; // Z1..Z5
const HR_ZONE_FILL = ['#fecaca', '#f87171', '#ef4444', '#dc2626', '#991b1b']; // Z1..Z5

const UNCATEGORIZED_KEY = '__uncategorized__';

function getLocalDateString(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function actDurationSec(act) {
  return Number(
    act.totalTimerTime ||
      act.moving_time ||
      act.movingTime ||
      act.totalElapsedTime ||
      act.elapsedTime ||
      act.duration ||
      0
  );
}

function sportBucket(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run') || s.includes('walk') || s.includes('hike')) return 'run';
  if (s.includes('swim')) return 'swim';
  if (s.includes('ride') || s.includes('cycle') || s.includes('bike') || s.includes('virtual')) return 'bike';
  return 'other';
}

function profileSportFromActivity(sport) {
  const b = sportBucket(sport);
  if (b === 'bike') return 'cycling';
  if (b === 'run') return 'running';
  if (b === 'swim') return 'swimming';
  return null;
}

function parseZoneNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toLowerCase();
  if (!cleaned) return null;
  if (cleaned === '∞' || cleaned.includes('inf')) return Infinity;
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function findZoneKeyForValue(value, zonesObj) {
  const val = Number(value);
  if (!Number.isFinite(val)) return null;
  for (const zKey of ZONE_KEYS) {
    const def = zonesObj?.[zKey];
    if (!def) continue;
    const min = parseZoneNumber(def?.min);
    const max = def?.max === undefined ? null : parseZoneNumber(def?.max);
    if (min === null) continue;
    const maxSafe = max === null ? Infinity : max;
    if (val >= min && val <= maxSafe) return zKey;
  }
  return null;
}

function hasZoneDefinitions(zonesObj) {
  if (!zonesObj || typeof zonesObj !== 'object') return false;
  return ZONE_KEYS.some((zKey) => {
    const def = zonesObj[zKey];
    if (!def) return false;
    return (def?.min !== '' && def?.min !== undefined) || (def?.max !== '' && def?.max !== undefined);
  });
}

function getPowerOrPaceMetric(act, profileSport) {
  if (profileSport === 'cycling') {
    const p = Number(act.avgPower ?? act.averagePower ?? act.average_watts ?? 0);
    return Number.isFinite(p) && p > 0 ? p : null;
  }
  const speedMps = Number(act.avgSpeed ?? act.averageSpeed ?? act.average_speed ?? 0);
  if (!Number.isFinite(speedMps) || speedMps <= 0) return null;
  if (profileSport === 'running') return 1000 / speedMps;
  if (profileSport === 'swimming') return 100 / speedMps;
  return null;
}

function getHeartRate(act) {
  const hr = Number(act.avgHeartRate ?? act.averageHeartRate ?? act.average_heartrate ?? 0);
  return Number.isFinite(hr) && hr > 0 ? hr : null;
}

function computeTssForAct(act, profile) {
  const seconds = actDurationSec(act);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;

  // Prefer provided TSS if present
  const existing =
    Number(act.tss ?? act.TSS ?? act.totalTSS ?? act.totalTss ?? act.totalTssValue ?? 0);
  if (Number.isFinite(existing) && existing > 0) return existing;

  if (!profile) return 0;

  const ps = profileSportFromActivity(act.sport);
  if (!ps) return 0;

  if (ps === 'cycling') {
    const ftp =
      parseZoneNumber(profile?.powerZones?.cycling?.lt2) ||
      parseZoneNumber(profile?.powerZones?.cycling?.zone5?.min) ||
      null;
    const avgPower = Number(
      act.normalizedPower ??
        act.NP ??
        act.avgPower ??
        act.averagePower ??
        act.average_watts ??
        act.avg_power ??
        0
    );
    if (!ftp || ftp <= 0 || !Number.isFinite(avgPower) || avgPower <= 0) return 0;
    // TSS = (seconds * NP^2) / (FTP^2 * 3600) * 100
    return Math.round((seconds * Math.pow(avgPower, 2)) / (Math.pow(ftp, 2) * 3600) * 100);
  }

  if (ps === 'running') {
    const speedMps = Number(act.avgSpeed ?? act.averageSpeed ?? act.average_speed ?? 0);
    if (!Number.isFinite(speedMps) || speedMps <= 0) return 0;
    const avgPaceSeconds = Math.round(1000 / speedMps); // sec/km
    const thresholdPace =
      parseZoneNumber(profile?.powerZones?.running?.lt2) ||
      parseZoneNumber(profile?.runningZones?.lt2) ||
      null;
    const referencePace = thresholdPace && thresholdPace > 0 ? thresholdPace : avgPaceSeconds;
    if (!referencePace || referencePace <= 0) return 0;
    // TSS = (seconds * (referencePace / avgPace)^2) / 3600 * 100
    const intensityRatio = referencePace / avgPaceSeconds;
    return Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
  }

  if (ps === 'swimming') {
    const speedMps = Number(act.avgSpeed ?? act.averageSpeed ?? act.average_speed ?? 0);
    if (!Number.isFinite(speedMps) || speedMps <= 0) return 0;
    const avgPaceSeconds = Math.round(100 / speedMps); // sec/100m
    const thresholdSwimPace =
      parseZoneNumber(profile?.powerZones?.swimming?.lt2) ||
      parseZoneNumber(profile?.swimmingZones?.lt2) ||
      null;
    const referencePace = thresholdSwimPace && thresholdSwimPace > 0 ? thresholdSwimPace : avgPaceSeconds;
    if (!referencePace || referencePace <= 0) return 0;
    const intensityRatio = referencePace / avgPaceSeconds;
    return Math.round((seconds * Math.pow(intensityRatio, 2)) / 3600 * 100);
  }

  return 0;
}

function categoryLabel(category) {
  const labels = {
    endurance: 'Endurance',
    tempo: 'Tempo',
    threshold: 'Threshold',
    vo2max: 'VO2max',
    anaerobic: 'Anaerobic',
    recovery: 'Recovery',
  };
  return labels[category] || (category ? String(category) : 'Uncategorized');
}

function categoryChipClass(category) {
  const colors = {
    endurance: 'bg-blue-100 border-blue-300 text-blue-800',
    tempo: 'bg-green-100 border-green-300 text-green-800',
    threshold: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    vo2max: 'bg-orange-100 border-orange-300 text-orange-800',
    anaerobic: 'bg-red-100 border-red-300 text-red-800',
    recovery: 'bg-gray-100 border-gray-300 text-gray-800',
  };
  return colors[category] || 'bg-gray-100 border-gray-300 text-gray-700';
}

function emptyChart(title, message) {
  return {
    title: { text: title, left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
    graphic: {
      type: 'text',
      left: 'center',
      top: 'middle',
      style: { text: message, fill: '#9ca3af', fontSize: 12 },
    },
  };
}

function chartTextTheme() {
  return {
    textStyle: { color: '#4b5563' },
    axisLine: { lineStyle: { color: '#e5e7eb' } },
    splitLine: { lineStyle: { color: 'rgba(229,231,235,0.6)' } },
  };
}

/**
 * Period analytics: volume, zones (from avg power/pace/HR), TSS, distance, list by training category.
 */
export default function CalendarPeriodStats({
  activities = [],
  period,
  user = null,
  userProfile = null,
  isMobile = false,
  onSelectActivity = null,
}) {
  const periodView = period?.view === 'week' ? 'week' : 'month';

  const filtered = useMemo(() => {
    if (!period?.periodStart || !period?.periodEnd) return [];
    const startK = getLocalDateString(period.periodStart);
    const endK = getLocalDateString(period.periodEnd);
    if (!startK || !endK) return [];
    return activities.filter((act) => {
      const raw = act.date || act.timestamp || act.startDate || act.start_time;
      if (!raw) return false;
      const k = getLocalDateString(raw);
      return k && k >= startK && k <= endK;
    });
  }, [activities, period]);

  const aggregates = useMemo(() => {
    let totalSec = 0;
    let totalDist = 0;
    let totalTss = 0;
    const bySportSec = { bike: 0, run: 0, swim: 0, other: 0 };
    const byDaySec = new Map();
    const byDayCount = new Map();
    const tssByProfileSport = { cycling: 0, running: 0, swimming: 0, other: 0 };
    const distByProfileSport = { cycling: 0, running: 0, swimming: 0, other: 0 };
    let maxTssAct = null;
    let maxDurAct = null;

    const powerZoneSec = {
      cycling: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      running: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      swimming: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
    };
    const hrZoneSec = {
      cycling: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      running: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
      swimming: Object.fromEntries(ZONE_KEYS.map((k) => [k, 0])),
    };

    filtered.forEach((act) => {
      const sec = actDurationSec(act);
      const dist = Number(act.distance || 0);
      const tssVal = computeTssForAct(act, userProfile);
      totalSec += sec;
      totalDist += dist;
      if (tssVal > 0) totalTss += tssVal;

      const b = sportBucket(act.sport);
      bySportSec[b] += sec;

      const ps = profileSportFromActivity(act.sport);
      const psk = ps || 'other';
      if (tssVal > 0) tssByProfileSport[psk] = (tssByProfileSport[psk] || 0) + tssVal;
      if (dist > 0) distByProfileSport[psk] = (distByProfileSport[psk] || 0) + dist;

      if (
        !maxTssAct ||
        tssVal > (Number(maxTssAct.tss || maxTssAct.TSS || maxTssAct.totalTSS) || 0)
      ) {
        if (tssVal > 0) maxTssAct = { ...act, tss: tssVal };
      }
      if (!maxDurAct || sec > actDurationSec(maxDurAct)) {
        if (sec > 0) maxDurAct = act;
      }

      const raw = act.date || act.timestamp || act.startDate;
      const dk = getLocalDateString(raw);
      if (dk) {
        byDaySec.set(dk, (byDaySec.get(dk) || 0) + sec);
        byDayCount.set(dk, (byDayCount.get(dk) || 0) + 1);
      }

      if (userProfile && ps) {
        const powerZones = userProfile?.powerZones?.[ps] || {};
        const hrZones = userProfile?.heartRateZones?.[ps] || {};
        const metric = getPowerOrPaceMetric(act, ps);
        if (metric != null && hasZoneDefinitions(powerZones)) {
          const zk = findZoneKeyForValue(metric, powerZones);
          if (zk) powerZoneSec[ps][zk] += sec;
        }
        const hr = getHeartRate(act);
        if (hr != null && hasZoneDefinitions(hrZones)) {
          const zk = findZoneKeyForValue(hr, hrZones);
          if (zk) hrZoneSec[ps][zk] += sec;
        }
      }
    });

    const dayKeys = [];
    if (period?.periodStart && period?.periodEnd) {
      const cur = new Date(period.periodStart);
      cur.setHours(0, 0, 0, 0);
      const endD = new Date(period.periodEnd);
      endD.setHours(0, 0, 0, 0);
      while (cur <= endD) {
        dayKeys.push(getLocalDateString(cur));
        cur.setDate(cur.getDate() + 1);
      }
    }
    const dailyHours = dayKeys.map((k) => Number(((byDaySec.get(k) || 0) / 3600).toFixed(2)));
    const dailyCounts = dayKeys.map((k) => byDayCount.get(k) || 0);

    const zoneSportsWithPower = PROFILE_SPORTS.filter((ps) => {
      if (!hasZoneDefinitions(userProfile?.powerZones?.[ps])) return false;
      return ZONE_KEYS.some((zk) => powerZoneSec[ps][zk] > 0);
    });
    const zoneSportsWithHr = PROFILE_SPORTS.filter((ps) => {
      if (!hasZoneDefinitions(userProfile?.heartRateZones?.[ps])) return false;
      return ZONE_KEYS.some((zk) => hrZoneSec[ps][zk] > 0);
    });

    return {
      count: filtered.length,
      totalSec,
      totalDist,
      totalTss,
      bySportSec,
      dayKeys,
      dailyHours,
      dailyCounts,
      tssByProfileSport,
      distByProfileSport,
      maxTssAct,
      maxDurAct,
      powerZoneSec,
      hrZoneSec,
      zoneSportsWithPower,
      zoneSportsWithHr,
    };
  }, [filtered, period?.periodStart, period?.periodEnd, userProfile]);

  const weekComparison = useMemo(() => {
    if (periodView !== 'week') return null;
    if (!period?.periodStart || !period?.periodEnd) return null;

    const prevStart = new Date(period.periodStart);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(period.periodEnd);
    prevEnd.setDate(prevEnd.getDate() - 7);

    const startK = getLocalDateString(prevStart);
    const endK = getLocalDateString(prevEnd);
    if (!startK || !endK) return null;

    const prevActs = activities.filter((act) => {
      const raw = act.date || act.timestamp || act.startDate || act.start_time;
      if (!raw) return false;
      const k = getLocalDateString(raw);
      return k && k >= startK && k <= endK;
    });

    let prevTss = 0;
    const prevDistByProfileSport = { cycling: 0, running: 0, swimming: 0, other: 0 };

    prevActs.forEach((act) => {
      const dist = Number(act.distance || 0);
      const ps = profileSportFromActivity(act.sport) || 'other';
      if (dist > 0) prevDistByProfileSport[ps] = (prevDistByProfileSport[ps] || 0) + dist;

      const tssVal = computeTssForAct(act, userProfile);
      if (tssVal > 0) prevTss += tssVal;
    });

    const deltaTss = (aggregates.totalTss || 0) - prevTss;
    const ratio = prevTss > 0 ? (aggregates.totalTss || 0) / prevTss : null;
    const overload = ratio != null ? ratio >= 1.35 : false;

    return {
      prevCount: prevActs.length,
      prevTss,
      deltaTss,
      ratio,
      overload,
      prevDistByProfileSport,
    };
  }, [periodView, period?.periodStart, period?.periodEnd, activities, userProfile, aggregates.totalTss]);

  const byCategory = useMemo(() => {
    const m = new Map();
    filtered.forEach((act) => {
      const key = act.category && String(act.category).trim() ? act.category : UNCATEGORIZED_KEY;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(act);
    });
    for (const arr of m.values()) {
      arr.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));
    }
    const items = Array.from(m.entries()).map(([key, acts]) => {
      const totalSec = acts.reduce((sum, a) => sum + actDurationSec(a), 0);
      return { key, acts, totalSec, count: acts.length };
    });

    // Uncategorized always last; otherwise sort by total time desc
    items.sort((a, b) => {
      if (a.key === UNCATEGORIZED_KEY) return 1;
      if (b.key === UNCATEGORIZED_KEY) return -1;
      return (b.totalSec || 0) - (a.totalSec || 0);
    });

    return {
      map: m,
      keys: items.map((i) => i.key),
      meta: new Map(items.map((i) => [i.key, { totalSec: i.totalSec, count: i.count }])),
    };
  }, [filtered]);

  const [showAllCategories, setShowAllCategories] = useState(false);
  const MAX_CATEGORIES_VISIBLE = 3;
  const visibleCategoryKeys = showAllCategories ? byCategory.keys : byCategory.keys.slice(0, MAX_CATEGORIES_VISIBLE);
  const hasMoreCategories = byCategory.keys.length > MAX_CATEGORIES_VISIBLE;

  const sportBarOption = useMemo(() => {
    const keys = ['bike', 'run', 'swim', 'other'].filter((k) => aggregates.bySportSec[k] > 0);
    if (keys.length === 0) return emptyChart('Time by sport', 'No activities');
    const hours = keys.map((k) => Number((aggregates.bySportSec[k] / 3600).toFixed(2)));
    const BUCKET_LABEL = { bike: 'Bike', run: 'Run', swim: 'Swim', other: 'Other' };
    const BUCKET_COLOR = { bike: '#3b82f6', run: '#f97316', swim: '#06b6d4', other: '#9ca3af' };
    return {
      backgroundColor: 'transparent',
      title: { text: 'Time by sport (h)', left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '14%', right: '8%', bottom: '10%', top: '22%', containLabel: true },
      xAxis: { type: 'value', ...chartTextTheme() },
      yAxis: { type: 'category', data: keys.map((k) => BUCKET_LABEL[k]), axisLabel: { color: '#374151' } },
      series: [
        {
          type: 'bar',
          data: keys.map((k, i) => ({ value: hours[i], itemStyle: { color: BUCKET_COLOR[k], borderRadius: [0, 6, 6, 0] } })),
          barMaxWidth: 26,
        },
      ],
    };
  }, [aggregates.bySportSec]);

  const dailyLineOption = useMemo(() => {
    if (!aggregates.dayKeys.length) return emptyChart('Daily time', 'No range');
    const labels = aggregates.dayKeys.map((k) => {
      const [, m, d] = k.split('-');
      return `${d}.${m}.`;
    });
    return {
      backgroundColor: 'transparent',
      title: { text: 'Daily time (h)', left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '10%', right: '6%', bottom: periodView === 'month' ? '20%' : '12%', top: '22%', containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#6b7280', rotate: periodView === 'month' ? 38 : 0, fontSize: 10 },
      },
      yAxis: { type: 'value', axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series: [
        {
          type: 'line',
          smooth: true,
          data: aggregates.dailyHours,
          areaStyle: { color: 'rgba(118, 126, 181, 0.18)' },
          lineStyle: { color: '#767EB5', width: 2 },
          symbol: 'circle',
          symbolSize: 5,
          itemStyle: { color: '#767EB5' },
        },
      ],
    };
  }, [aggregates.dayKeys, aggregates.dailyHours, periodView]);

  const dailyCountOption = useMemo(() => {
    if (!aggregates.dayKeys.length) return emptyChart('Activities per day', 'No range');
    const labels = aggregates.dayKeys.map((k) => {
      const [, m, d] = k.split('-');
      return `${d}.${m}.`;
    });
    return {
      backgroundColor: 'transparent',
      title: { text: 'Activities per day', left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '8%', right: '6%', bottom: periodView === 'month' ? '20%' : '12%', top: '22%', containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { color: '#6b7280', rotate: periodView === 'month' ? 38 : 0, fontSize: 10 },
      },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series: [{ type: 'bar', data: aggregates.dailyCounts, itemStyle: { color: '#a5b4fc', borderRadius: [4, 4, 0, 0] } }],
    };
  }, [aggregates.dayKeys, aggregates.dailyCounts, periodView]);

  const tssPieOption = useMemo(() => {
    const data = PROFILE_SPORTS.map((ps) => ({
      name: SPORT_LABEL[ps],
      value: Math.round(aggregates.tssByProfileSport[ps] || 0),
    })).filter((d) => d.value > 0);
    if (data.length === 0) return emptyChart('TSS by sport', 'No TSS data');
    return {
      backgroundColor: 'transparent',
      title: { text: 'TSS by sport', left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: '#6b7280', fontSize: 10 } },
      series: [
        {
          type: 'pie',
          radius: ['38%', '62%'],
          center: ['50%', '52%'],
          data,
          label: { color: '#374151', fontSize: 10 },
          itemStyle: {
            borderRadius: 6,
            borderColor: 'rgba(255,255,255,0.8)',
            borderWidth: 2,
          },
          color: [SPORT_STACK_COLOR.cycling, SPORT_STACK_COLOR.running, SPORT_STACK_COLOR.swimming],
        },
      ],
    };
  }, [aggregates.tssByProfileSport]);

  const distBarOption = useMemo(() => {
    const data = PROFILE_SPORTS.map((ps) => ({
      name: SPORT_LABEL[ps],
      value: Number(((aggregates.distByProfileSport[ps] || 0) / 1000).toFixed(1)),
    })).filter((d) => d.value > 0);
    if (data.length === 0) return emptyChart('Distance by sport', 'No distance');
    return {
      backgroundColor: 'transparent',
      title: { text: 'Distance by sport (km)', left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: { trigger: 'axis' },
      grid: { left: '12%', right: '8%', bottom: '12%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: { color: '#374151' } },
      yAxis: { type: 'value', axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series: [
        {
          type: 'bar',
          data: data.map((d) => {
            const psKey = PROFILE_SPORTS.find((ps) => SPORT_LABEL[ps] === d.name) || 'cycling';
            return {
              value: d.value,
              itemStyle: {
                color: SPORT_STACK_COLOR[psKey],
                borderRadius: [6, 6, 0, 0],
              },
            };
          }),
          barMaxWidth: 36,
        },
      ],
    };
  }, [aggregates.distByProfileSport]);

  const powerZonesStackedOption = useMemo(() => {
    if (!aggregates.zoneSportsWithPower.length) {
      return emptyChart(
        'Time in power / pace zones',
        userProfile ? 'Add zones in profile or record avg power/pace' : 'Load profile for zones'
      );
    }
    const series = aggregates.zoneSportsWithPower.map((ps) => ({
      name: SPORT_LABEL[ps],
      type: 'bar',
      stack: 'zones',
      emphasis: { focus: 'series' },
      itemStyle: { color: SPORT_STACK_COLOR[ps], borderRadius: 2 },
      data: ZONE_KEYS.map((zk) => Number((aggregates.powerZoneSec[ps][zk] / 3600).toFixed(2))),
    }));
    return {
      backgroundColor: 'transparent',
      title: {
        text: 'Time in power / pace zones (h)',
        left: 'center',
        top: 8,
        textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          if (!Array.isArray(params)) return '';
          let h = params[0]?.axisValueLabel || '';
          params.forEach((p) => {
            if (p.value > 0) h += `<br/>${p.marker}${p.seriesName}: ${p.value} h`;
          });
          return h;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 10, color: '#6b7280' } },
      grid: { left: '10%', right: '8%', bottom: aggregates.zoneSportsWithPower.length > 1 ? '18%' : '14%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: ZONE_LABELS, axisLabel: { color: '#374151', fontWeight: 600 } },
      yAxis: { type: 'value', name: 'h', axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series,
    };
  }, [aggregates.zoneSportsWithPower, aggregates.powerZoneSec, userProfile]);

  const hrZonesStackedOption = useMemo(() => {
    if (!aggregates.zoneSportsWithHr.length) {
      return emptyChart('Time in HR zones', userProfile ? 'Add HR zones or record average HR' : 'Load profile for zones');
    }
    const series = aggregates.zoneSportsWithHr.map((ps) => ({
      name: SPORT_LABEL[ps],
      type: 'bar',
      stack: 'hr',
      emphasis: { focus: 'series' },
      itemStyle: { color: SPORT_STACK_COLOR[ps], opacity: 0.88, borderRadius: 2 },
      data: ZONE_KEYS.map((zk) => Number((aggregates.hrZoneSec[ps][zk] / 3600).toFixed(2))),
    }));
    return {
      backgroundColor: 'transparent',
      title: { text: 'Time in HR zones (h)', left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          if (!Array.isArray(params)) return '';
          let h = params[0]?.axisValueLabel || '';
          params.forEach((p) => {
            if (p.value > 0) h += `<br/>${p.marker}${p.seriesName}: ${p.value} h`;
          });
          return h;
        },
      },
      legend: { bottom: 0, textStyle: { fontSize: 10, color: '#6b7280' } },
      grid: { left: '10%', right: '8%', bottom: aggregates.zoneSportsWithHr.length > 1 ? '18%' : '14%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: ZONE_LABELS, axisLabel: { color: '#374151', fontWeight: 600 } },
      yAxis: { type: 'value', name: 'h', axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series,
    };
  }, [aggregates.zoneSportsWithHr, aggregates.hrZoneSec, userProfile]);

  const powerZonesBySportOption = (ps) => {
    const zonesObj = userProfile?.powerZones?.[ps] || {};
    if (!hasZoneDefinitions(zonesObj)) {
      return emptyChart(`Power/Pace zones - ${SPORT_LABEL[ps]}`, 'No zone definitions');
    }

    const secMap = aggregates.powerZoneSec?.[ps] || {};
    const totalSec = ZONE_KEYS.reduce((sum, zk) => sum + (secMap[zk] || 0), 0);
    if (totalSec <= 0) return emptyChart(`Power/Pace zones - ${SPORT_LABEL[ps]}`, 'No time in zones');

    const data = ZONE_KEYS.map((zk, zi) => {
      const sec = secMap[zk] || 0;
      const hours = Number((sec / 3600).toFixed(2));
      const percent = totalSec > 0 ? (sec / totalSec) * 100 : 0;
      return { value: hours, percent, itemStyle: { color: POWER_ZONE_FILL[zi] } };
    });

    return {
      backgroundColor: 'transparent',
      title: { text: `Power/Pace zones - ${SPORT_LABEL[ps]}`, left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          if (!Array.isArray(params) || !params[0]) return '';
          const p = params[0];
          const zone = p.axisValueLabel || p.name || '';
          const h = p.value ?? 0;
          const pct = p.data?.percent ?? 0;
          return `${zone}<br/>Time: ${h} h<br/>${pct.toFixed(1)}%`;
        },
      },
      grid: { left: '12%', right: '8%', bottom: '14%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: ZONE_LABELS, axisLabel: { color: '#374151', fontWeight: 600 } },
      yAxis: { type: 'value', name: 'h', axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series: [{ type: 'bar', data, barMaxWidth: 26, itemStyle: { borderRadius: [6, 6, 0, 0] } }],
    };
  };

  const hrZonesBySportOption = (ps) => {
    const zonesObj = userProfile?.heartRateZones?.[ps] || {};
    if (!hasZoneDefinitions(zonesObj)) {
      return emptyChart(`HR zones - ${SPORT_LABEL[ps]}`, 'No zone definitions');
    }

    const secMap = aggregates.hrZoneSec?.[ps] || {};
    const totalSec = ZONE_KEYS.reduce((sum, zk) => sum + (secMap[zk] || 0), 0);
    if (totalSec <= 0) return emptyChart(`HR zones - ${SPORT_LABEL[ps]}`, 'No time in zones');

    const data = ZONE_KEYS.map((zk, zi) => {
      const sec = secMap[zk] || 0;
      const hours = Number((sec / 3600).toFixed(2));
      const percent = totalSec > 0 ? (sec / totalSec) * 100 : 0;
      return { value: hours, percent, itemStyle: { color: HR_ZONE_FILL[zi] } };
    });

    return {
      backgroundColor: 'transparent',
      title: { text: `HR zones - ${SPORT_LABEL[ps]}`, left: 'center', top: 8, textStyle: { fontSize: 12, color: '#6b7280', fontWeight: 600 } },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter(params) {
          if (!Array.isArray(params) || !params[0]) return '';
          const p = params[0];
          const zone = p.axisValueLabel || p.name || '';
          const h = p.value ?? 0;
          const pct = p.data?.percent ?? 0;
          return `${zone}<br/>Time: ${h} h<br/>${pct.toFixed(1)}%`;
        },
      },
      grid: { left: '12%', right: '8%', bottom: '14%', top: '22%', containLabel: true },
      xAxis: { type: 'category', data: ZONE_LABELS, axisLabel: { color: '#374151', fontWeight: 600 } },
      yAxis: { type: 'value', name: 'h', axisLabel: { color: '#6b7280' }, splitLine: { lineStyle: { color: 'rgba(229,231,235,0.7)' } } },
      series: [{ type: 'bar', data, barMaxWidth: 26, itemStyle: { borderRadius: [6, 6, 0, 0] } }],
    };
  };

  if (!period?.label) return null;

  const cardCls =
    'min-w-0 px-3 py-2.5 sm:py-3 rounded-xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-sm';
  const Chart = typeof ReactECharts === 'function' ? ReactECharts : null;
  const chartWrap = 'bg-white/5 rounded-xl border border-white/10 p-2 sm:p-3 min-h-[240px]';

  const fmtActDate = (act) => {
    const raw = act.date || act.timestamp || act.startDate;
    if (!raw) return '';
    try {
      return new Date(raw).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const sportDotClass = (sport) => {
    const b = sportBucket(sport);
    if (b === 'run') return 'bg-orange-500';
    if (b === 'swim') return 'bg-cyan-500';
    if (b === 'bike') return 'bg-blue-500';
    return 'bg-gray-400';
  };

  return (
    <div
      className={`w-full ${isMobile ? 'mt-2' : 'mt-3 sm:mt-4 md:mt-5'} space-y-4 sm:space-y-5`}
    >
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/20 shadow-md p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-gray-900">Period summary</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              {period.label}
              <span className="text-gray-400 ml-1">({periodView === 'week' ? 'week' : 'month'})</span>
            </p>
          </div>
          <div className="text-xs text-gray-500 font-medium">
            {aggregates.count} {aggregates.count === 1 ? 'activity' : 'activities'}
          </div>
        </div>

        <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed border border-white/15 rounded-lg px-2.5 py-2 bg-white/5">
          Zone times are <span className="font-semibold text-gray-600">estimates</span>: each activity is counted using its
          average power, pace, or HR against your profile zones (not second-by-second files).
        </p>

        {weekComparison && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-sm p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-gray-900">Weekly progress</h3>
              <div className="text-xs text-gray-600">
                Prev: <span className="font-semibold text-gray-900">{Math.round(weekComparison.prevTss || 0)} TSS</span>
                <span className="text-gray-400 mx-1">•</span>
                This: <span className="font-semibold text-gray-900">{Math.round(aggregates.totalTss || 0)} TSS</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className={cardCls}>
                <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Current TSS</div>
                <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">{Math.round(aggregates.totalTss || 0)} </div>
              </div>
              <div className={cardCls}>
                <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Previous TSS</div>
                <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">{Math.round(weekComparison.prevTss || 0)} </div>
              </div>
              <div className={cardCls}>
                <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Delta</div>
                <div
                  className={`text-sm sm:text-base font-bold mt-1 ${
                    weekComparison.deltaTss >= 0 ? 'text-greenos' : 'text-red-600'
                  }`}
                >
                  {weekComparison.deltaTss >= 0 ? '+' : ''}
                  {Math.round(weekComparison.deltaTss || 0)}
                </div>
              </div>
              <div className={cardCls}>
                <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Overload</div>
                <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">
                  {weekComparison.overload ? (
                    <span className="text-red-600">Risk</span>
                  ) : (
                    <span className="text-greenos">OK</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {['cycling', 'running', 'swimming'].map((ps) => {
                const cur = aggregates.distByProfileSport?.[ps] || 0;
                const prev = weekComparison.prevDistByProfileSport?.[ps] || 0;
                const label = SPORT_LABEL[ps];
                const dotCls = sportDotClass(ps === 'cycling' ? 'bike' : ps === 'running' ? 'run' : 'swim');
                return (
                  <div key={ps} className="min-w-0 rounded-xl border border-white/20 bg-white/5 p-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dotCls}`} />
                      <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">{label} mileage</div>
                    </div>
                    <div className="text-sm sm:text-base font-bold text-gray-900 mt-1 truncate">
                      {cur > 0 ? formatDistance(cur, user) : '—'}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Prev: {prev > 0 ? formatDistance(prev, user) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,8.5rem),1fr))]">
          <div className={cardCls}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Total time</div>
            <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">{formatDuration(aggregates.totalSec)}</div>
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Distance</div>
            <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">
              {aggregates.totalDist > 0 ? formatDistance(aggregates.totalDist, user) : '—'}
            </div>
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Total TSS</div>
            <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">
              {aggregates.totalTss > 0 ? Math.round(aggregates.totalTss) : '—'}
            </div>
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Avg / activity</div>
            <div className="text-sm sm:text-base font-bold text-gray-900 mt-1">
              {aggregates.count > 0 ? formatDuration(Math.round(aggregates.totalSec / aggregates.count)) : '—'}
            </div>
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Longest</div>
            <div className="text-xs sm:text-sm font-bold text-gray-900 mt-1 leading-snug line-clamp-2">
              {aggregates.maxDurAct ? (
                <>
                  {formatDuration(actDurationSec(aggregates.maxDurAct))}
                  <span className="block text-[10px] font-normal text-gray-500 truncate">{aggregates.maxDurAct.title}</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div className={cardCls}>
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-gray-500">Peak TSS</div>
            <div className="text-xs sm:text-sm font-bold text-gray-900 mt-1 leading-snug line-clamp-2">
              {aggregates.maxTssAct ? (
                <>
                  {Math.round(Number(aggregates.maxTssAct.tss || aggregates.maxTssAct.TSS || aggregates.maxTssAct.totalTSS || 0))}
                  <span className="block text-[10px] font-normal text-gray-500 truncate">{aggregates.maxTssAct.title}</span>
                </>
              ) : (
                '—'
              )}
            </div>
          </div>
        </div>

        {aggregates.dayKeys.length > 0 && (
          <div className={`grid gap-3 sm:gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
            <div className={chartWrap}>
              {Chart ? <Chart option={sportBarOption} style={{ height: 240, width: '100%' }} notMerge /> : null}
            </div>
            <div className={chartWrap}>
              {Chart ? <Chart option={dailyLineOption} style={{ height: 240, width: '100%' }} notMerge /> : null}
            </div>
            <div className={chartWrap}>
              {Chart ? <Chart option={dailyCountOption} style={{ height: 240, width: '100%' }} notMerge /> : null}
            </div>
            <div className={chartWrap}>
              {Chart ? <Chart option={tssPieOption} style={{ height: 260, width: '100%' }} notMerge /> : null}
            </div>
            <div className={chartWrap}>
              {Chart ? <Chart option={distBarOption} style={{ height: 240, width: '100%' }} notMerge /> : null}
            </div>
            <div className={chartWrap}>
              {Chart ? <Chart option={powerZonesStackedOption} style={{ height: 280, width: '100%' }} notMerge /> : null}
            </div>
            <div className={`${chartWrap} ${isMobile ? '' : 'lg:col-span-2'}`}>
              {Chart ? <Chart option={hrZonesStackedOption} style={{ height: 280, width: '100%' }} notMerge /> : null}
            </div>

            {/* Per-sport distribution (power/pace) */}
            {aggregates.zoneSportsWithPower.includes('cycling') && (
              <div className={chartWrap}>
                {Chart ? <Chart option={powerZonesBySportOption('cycling')} style={{ height: 240, width: '100%' }} notMerge /> : null}
              </div>
            )}
            {aggregates.zoneSportsWithPower.includes('running') && (
              <div className={chartWrap}>
                {Chart ? <Chart option={powerZonesBySportOption('running')} style={{ height: 240, width: '100%' }} notMerge /> : null}
              </div>
            )}
            {aggregates.zoneSportsWithPower.includes('swimming') && (
              <div className={chartWrap}>
                {Chart ? <Chart option={powerZonesBySportOption('swimming')} style={{ height: 240, width: '100%' }} notMerge /> : null}
              </div>
            )}

            {/* Per-sport distribution (HR) */}
            {aggregates.zoneSportsWithHr.includes('cycling') && (
              <div className={chartWrap}>
                {Chart ? <Chart option={hrZonesBySportOption('cycling')} style={{ height: 240, width: '100%' }} notMerge /> : null}
              </div>
            )}
            {aggregates.zoneSportsWithHr.includes('running') && (
              <div className={chartWrap}>
                {Chart ? <Chart option={hrZonesBySportOption('running')} style={{ height: 240, width: '100%' }} notMerge /> : null}
              </div>
            )}
            {aggregates.zoneSportsWithHr.includes('swimming') && (
              <div className={chartWrap}>
                {Chart ? <Chart option={hrZonesBySportOption('swimming')} style={{ height: 240, width: '100%' }} notMerge /> : null}
              </div>
            )}
          </div>
        )}
      </div>

      {byCategory.keys.length > 0 && (
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl sm:rounded-3xl border border-white/20 shadow-md p-3 sm:p-4 md:p-6 space-y-5">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 border-b border-white/20 pb-2">By category</h3>
          {visibleCategoryKeys.map((catKey) => {
            const acts = byCategory.map.get(catKey) || [];
            const displayCat = catKey === UNCATEGORIZED_KEY ? null : catKey;
            return (
              <div key={catKey} className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-lg border ${categoryChipClass(displayCat)}`}
                  >
                    {categoryLabel(displayCat)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {acts.length} {acts.length === 1 ? 'activity' : 'activities'}
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {acts.map((act, idx) => {
                    const sec = actDurationSec(act);
                    const tss = computeTssForAct(act, userProfile);
                    const dist = Number(act.distance || 0);
                    return (
                      <button
                        key={`${act.id}-${idx}`}
                        type="button"
                        disabled={!onSelectActivity}
                        onClick={() => onSelectActivity && onSelectActivity(act)}
                        className={`text-left rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 backdrop-blur-md shadow-sm p-3 transition-colors ${
                          onSelectActivity ? 'cursor-pointer' : 'cursor-default opacity-90'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${sportDotClass(act.sport)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-gray-900 truncate">{act.title || 'Activity'}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{fmtActDate(act)}</div>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-2 text-[11px] text-gray-600">
                              {sec > 0 && <span>{formatDuration(sec)}</span>}
                              {dist > 0 && <span>{formatDistance(dist, user)}</span>}
                              {tss > 0 && <span className="text-primary font-medium">{Math.round(tss)} TSS</span>}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {hasMoreCategories && !showAllCategories && (
            <button
              type="button"
              onClick={() => setShowAllCategories(true)}
              className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-sm font-medium text-gray-700 bg-white/10 border border-white/20 hover:bg-white/20 shadow-sm transition-colors"
            >
              Show more ({byCategory.keys.length - MAX_CATEGORIES_VISIBLE})
            </button>
          )}

          {hasMoreCategories && showAllCategories && (
            <button
              type="button"
              onClick={() => setShowAllCategories(false)}
              className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-sm font-medium text-gray-700 bg-white/10 border border-white/20 hover:bg-white/20 shadow-sm transition-colors"
            >
              Show fewer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
