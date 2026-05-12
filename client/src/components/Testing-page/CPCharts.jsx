import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { fitCP, predictAtDuration, formatCpValue } from './cpCalculator';

// Idempotent — ChartJS.register accepts repeat calls and dedupes.
ChartJS.register(LineElement, PointElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler);

/**
 * Hyperbolic CP model chart: power-duration curve `P(t) = CP + W'/t` with the
 * athlete's measured efforts plotted as points and a horizontal CP line.
 *
 * For pace sports the Y axis is reversed (smaller seconds = harder, plotted
 * at the top of the chart).
 */
export function HyperbolaChart({ efforts, sport = 'bike', height = 220 }) {
  const data = useMemo(() => {
    const fit = fitCP(efforts, sport);
    if (!fit.valid) return null;
    const isPace = sport === 'run' || sport === 'swim';

    // Sample the curve across a representative duration range. Start at 60 s
    // and go to 3600 s (1 h) — long enough to show the asymptotic flattening
    // toward CP but short enough for the W'/t hump to be visible.
    const ts = [];
    for (let t = 60; t <= 3600; t += t < 300 ? 15 : t < 1200 ? 60 : 300) ts.push(t);

    const curve = ts.map(t => ({ x: t, y: predictAtDuration(t, fit, sport) }));

    // Effort scatter — only valid entries.
    const measured = (efforts || [])
      .filter(e => Number(e.durationSec) > 0 && Number(e.value) > 0)
      .map(e => ({ x: Number(e.durationSec), y: Number(e.value) }));

    // Horizontal CP reference line spanning the X range.
    const cpLine = [
      { x: ts[0], y: fit.cp },
      { x: ts[ts.length - 1], y: fit.cp },
    ];

    return {
      datasets: [
        {
          label: `Model P(t) = CP + W'/t`,
          data: curve,
          borderColor: '#6366f1',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.15,
          fill: false,
        },
        {
          label: `CP ${formatCpValue(fit.cp, sport)}`,
          data: cpLine,
          borderColor: '#a78bfa',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          fill: false,
        },
        {
          label: 'Efforts',
          data: measured,
          borderColor: '#f59e0b',
          backgroundColor: '#f59e0b',
          pointRadius: 5,
          pointHoverRadius: 7,
          showLine: false,
          fill: false,
        },
      ],
      // expose isPace so options below can flip the Y axis
      _isPace: isPace,
    };
  }, [efforts, sport]);

  if (!data) {
    return (
      <div className="h-[120px] flex items-center justify-center text-xs text-gray-400">
        Add a second effort to see the model curve.
      </div>
    );
  }

  const isPace = data._isPace;
  const fmtT = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s === 0 ? `${m}m` : `${m}:${String(s).padStart(2, '0')}`;
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: { boxWidth: 8, font: { size: 10 }, padding: 8 },
      },
      tooltip: {
        callbacks: {
          title: (items) => `t = ${fmtT(items[0].parsed.x)}`,
          label: (ctx) => `${ctx.dataset.label}: ${formatCpValue(ctx.parsed.y, sport)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: 60,
        max: 3600,
        title: { display: true, text: 'Duration', font: { size: 10 }, color: '#6b7280' },
        ticks: {
          font: { size: 10 },
          color: '#9ca3af',
          callback: (val) => fmtT(val),
          maxTicksLimit: 8,
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      y: {
        // For pace, lower seconds = higher intensity → reverse Y axis so
        // "harder" effort sits at the top, matching the bike convention.
        reverse: isPace,
        title: {
          display: true,
          text: sport === 'bike' ? 'Power (W)' : sport === 'swim' ? 'Pace /100m' : 'Pace /km',
          font: { size: 10 },
          color: '#6b7280',
        },
        ticks: {
          font: { size: 10 },
          color: '#9ca3af',
          callback: (val) => sport === 'bike' ? `${Math.round(val)} W` : fmtT(val),
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}

/**
 * Trend chart — CP progression across multiple tests for the same sport.
 */
export function CPTrendChart({ tests, sport = 'bike', height = 180 }) {
  const data = useMemo(() => {
    if (!Array.isArray(tests) || tests.length === 0) return null;
    const ordered = tests
      .filter(t => t.sport === sport && t.cp != null && Number.isFinite(Number(t.cp)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (ordered.length < 2) return null;
    return {
      // Use category axis (no chartjs-adapter dependency needed). Labels are
      // short ISO-ish dates; tooltip has the long form.
      labels: ordered.map(t => new Date(t.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: '2-digit' })),
      datasets: [
        {
          label: `CP — ${sport}`,
          data: ordered.map(t => Number(t.cp)),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6366f1',
          tension: 0.2,
          fill: true,
        },
      ],
    };
  }, [tests, sport]);

  if (!data) return null;

  const isPace = sport === 'run' || sport === 'swim';
  const fmtT = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'nearest', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `CP: ${formatCpValue(ctx.parsed.y, sport)}`,
        },
      },
    },
    scales: {
      x: {
        type: 'category',
        ticks: { font: { size: 10 }, color: '#9ca3af', maxTicksLimit: 6 },
        grid: { display: false },
      },
      y: {
        reverse: isPace,
        title: {
          display: true,
          text: sport === 'bike' ? 'CP (W)' : 'CP (pace)',
          font: { size: 10 },
          color: '#6b7280',
        },
        ticks: {
          font: { size: 10 },
          color: '#9ca3af',
          callback: (val) => sport === 'bike' ? `${Math.round(val)} W` : fmtT(val),
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
