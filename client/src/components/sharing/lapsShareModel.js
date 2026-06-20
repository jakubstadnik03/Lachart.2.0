/**
 * Lap normalisation + colours for share SVG — mirrors LapsBarChart.jsx so
 * exported cards match the in-app laps chart.
 */

export function resolveLapSport(sport) {
  const v = String(sport || '').toLowerCase();
  const isRun = v.includes('run') || v === 'walk' || v.includes('hike');
  const isSwim = v.includes('swim');
  const isBike = !isRun && !isSwim && (v.includes('ride') || v.includes('bike') || v.includes('cycle') || v.includes('virtual'));
  return { isRun, isSwim, isBike, key: isSwim ? 'swim' : isBike ? 'bike' : isRun ? 'run' : 'other' };
}

function lapDurSec(lap) {
  return Number(lap?.moving_time || lap?.movingTime || lap?.totalMovingTime
    || lap?.elapsed_time || lap?.totalElapsedTime || lap?.totalTimerTime
    || lap?.duration || lap?.durationSeconds || 0);
}

function lapDistM(lap) {
  return Number(lap?.distance || lap?.totalDistance || lap?.distanceMeters || 0);
}

function lapPower(lap) {
  return Number(lap?.avgPower || lap?.avg_power || lap?.average_watts || lap?.averageWatts || 0);
}

function lapHr(lap) {
  return Number(lap?.avgHeartRate || lap?.avg_heart_rate || lap?.average_heartrate || lap?.averageHeartRate || 0);
}

function lapSpeedMps(lap, isRun, isSwim) {
  const raw = Number(lap?.avgSpeed || lap?.average_speed || lap?.avg_speed || lap?.averageSpeed
    || lap?.enhancedAvgSpeed || lap?.enhanced_avg_speed || lap?.speed || 0);
  const dist = lapDistM(lap);
  const dur = lapDurSec(lap);
  if (raw > 0.05) return raw;
  if ((isRun || isSwim) && dist > 0 && dur > 0) return dist / dur;
  return 0;
}

export function buildLapShareEntries(laps = [], sport = '') {
  const { isRun, isSwim, isBike } = resolveLapSport(sport);
  return (laps || []).map((lap, i) => {
    const lapNumber = lap?.lapNumber ?? (i + 1);
    const power = lapPower(lap);
    const hr = lapHr(lap);
    const speedMps = lapSpeedMps(lap, isRun, isSwim);
    const distanceM = lapDistM(lap);
    const duration = lapDurSec(lap) || 1;
    const lactate = lap?.lactate != null && Number.isFinite(Number(lap.lactate))
      ? Number(lap.lactate) : null;
    const isPause = isSwim && distanceM < 10;
    const intervalType = lap?.intervalType ?? null;

    let value = 0;
    let metric = 'hr';
    if (isPause) { value = 0; metric = 'pause'; }
    else if (isBike && power > 0) { value = power; metric = 'power'; }
    else if ((isRun || isSwim) && speedMps > 0) {
      value = speedMps;
      metric = isSwim ? 'pace' : 'speed';
    } else if (hr > 0) { value = hr; metric = 'hr'; }

    return {
      lapNumber, value, metric, hr, power, speedMps, lactate, duration,
      distanceM, isPause, intervalType, lap,
    };
  });
}

export function lapShareScales(entries) {
  const active = entries.filter((e) => !e.isPause && e.value > 0);
  const maxVal = Math.max(...active.map((e) => e.value), 1);
  const minVal = active.length ? Math.min(...active.map((e) => e.value).filter((v) => v > 0)) : 0;
  const chartFloor = minVal > 0 ? minVal * 0.92 : 0;
  const intensityMap = new Map();
  const range = maxVal - minVal;
  active.forEach((e) => {
    intensityMap.set(e.lapNumber, range > 0 ? (e.value - minVal) / range : 0.5);
  });
  const yTicks = [];
  for (let i = 0; i <= 4; i++) {
    const frac = i / 4;
    yTicks.push(chartFloor + (maxVal - chartFloor) * (1 - frac));
  }
  return { active, maxVal, chartFloor, intensityMap, yTicks };
}

function swimBarColor(entry, intensityMap) {
  if (entry.isPause) return '#475569';
  const intensity = intensityMap.get(entry.lapNumber) ?? 0.5;
  const light = [191, 219, 254];
  const dark = [30, 58, 138];
  const r = Math.round(light[0] + (dark[0] - light[0]) * intensity);
  const g = Math.round(light[1] + (dark[1] - light[1]) * intensity);
  const b = Math.round(light[2] + (dark[2] - light[2]) * intensity);
  return `rgb(${r},${g},${b})`;
}

export function lapShareBarColor(entry, { isSwim, intensityMap }) {
  if (isSwim) return swimBarColor(entry, intensityMap);
  const itype = entry.intervalType;
  if (entry.isPause) return '#64748b';
  if (itype === 'warmup') return '#fbbf24';
  if (itype === 'cooldown') return '#38bdf8';
  if (itype === 'recovery') return '#94a3b8';
  if (entry.lactate != null) return '#a78bfa';
  if (entry.metric === 'power') return '#74c0fc';
  if (entry.metric === 'pace' || entry.metric === 'speed') return '#8ce99a';
  return '#ffa8a8';
}

export function formatLapMetricY(val, metric) {
  if (!val || val <= 0) return '';
  if (metric === 'power') return `${Math.round(val)}`;
  if (metric === 'speed') {
    const sec = 1000 / val;
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  }
  if (metric === 'pace') {
    const sec = 100 / val;
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  }
  return `${Math.round(val)}`;
}

export function lapMetricTitle(metric) {
  if (metric === 'power') return 'POWER';
  if (metric === 'pace') return 'PACE';
  if (metric === 'speed') return 'PACE';
  if (metric === 'hr') return 'HR';
  return 'LAPS';
}

export function formatLapBarLabel(entry, isRun) {
  if (entry.isPause) return '';
  if (entry.metric === 'power') return `${Math.round(entry.power)}W`;
  if (entry.metric === 'pace') {
    const sec = 100 / entry.speedMps;
    return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  }
  if (entry.metric === 'speed') {
    if (isRun) {
      const sec = 1000 / entry.speedMps;
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    return `${(entry.speedMps * 3.6).toFixed(1)}`;
  }
  return `${Math.round(entry.hr)}`;
}
