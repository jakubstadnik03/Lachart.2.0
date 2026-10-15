/**
 * The run's peak curve, read in pace.
 *
 * The session view drew this chart from watts whatever the sport, so a run
 * was headed "max 604 W" — a number Strava estimated and no runner trains by.
 * Drawn from speed and labelled in pace it says something the athlete can use,
 * but only if the averaging still runs on speed: pace counts backwards, and
 * averaging it would report the session's SLOWEST minute as its peak.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PeakValuesChart, { readSpeed } from './PeakValuesChart';
import { formatPaceFromSpeedMps, formatPaceMMSS, paceSecondsFromSpeedMps } from '../../utils/unitsConverter';

// Twenty easy minutes at 4:00/km with one hard minute at 3:00/km inside it.
const records = [];
const t0 = Date.UTC(2026, 8, 29, 6, 0, 0);
for (let i = 0; i < 1200; i++) {
  const hard = i >= 600 && i < 660;
  records.push({
    timestamp: new Date(t0 + i * 1000).toISOString(),
    speed: hard ? 1000 / 180 : 1000 / 240,
  });
}

const paceChart = () => renderToStaticMarkup(
  <PeakValuesChart
    records={records}
    read={readSpeed}
    color="#767EB5"
    unit="/km"
    title="Peak values (pace)"
    bestLabel="best"
    minDuration={5}
    format={(mps) => formatPaceFromSpeedMps(mps, 'metric', 'run') || '—'}
    formatTick={(mps) => formatPaceMMSS(paceSecondsFromSpeedMps(mps, 'metric', 'run')) || ''}
  />,
);

describe('PeakValuesChart in pace mode', () => {
  it('reports the fastest minute, not the slowest', () => {
    const html = paceChart();
    expect(html).toContain('best 3:00/km');
    expect(html).not.toContain('4:00/km');
  });

  it('labels the axis in pace rather than metres per second', () => {
    expect(paceChart()).toMatch(/>\d:\d\d</);
  });

  it('draws nothing when the run has no speed at all', () => {
    const noSpeed = records.map(({ timestamp }) => ({ timestamp }));
    expect(renderToStaticMarkup(
      <PeakValuesChart records={noSpeed} read={readSpeed} color="#767EB5" unit="/km" title="Peak values (pace)" />,
    )).toBe('');
  });
});
