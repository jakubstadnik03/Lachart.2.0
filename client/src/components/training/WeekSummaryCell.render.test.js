/**
 * "2011 %": one planned 52-minute swim against a seventeen-hour week. Past a
 * few times the plan the percentage describes nothing, so it is not shown.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@heroicons/react/24/outline', () => ({ ArrowUpIcon: () => null, ArrowDownIcon: () => null, MinusIcon: () => null, FireIcon: () => null }));
jest.mock('../shared/SportIcon', () => () => null);

// eslint-disable-next-line import/first
import WeekSummaryCell from './WeekSummaryCell';

const fmtH = (s) => `${Math.floor(s / 3600)}:${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`;
const toHtml = (summary, planned = []) => renderToStaticMarkup(
  <WeekSummaryCell weekSummary={summary} formatHours={fmtH} formatKm={(m) => `${(m / 1000).toFixed(1)} km`} weekPlannedWorkouts={planned} />,
);
const base = { totalTSS: 0, runSeconds: 0, bikeSeconds: 0, swimSeconds: 0, strengthSeconds: 0, distanceRun: 0, distanceBike: 0, distanceSwim: 0, plannedTSS: 0, sessionCount: 1 };

describe('WeekSummaryCell', () => {
  it('drops the percentage when the week ran twenty times its plan', () => {
    const view = toHtml({ ...base, totalSeconds: 62735, plannedSeconds: 3120 }, [{ sport: 'swim', plannedDuration: 3120 }]);
    expect(view).not.toContain('2011%');
    expect(view).not.toMatch(/\d{4}%/);
    expect(view).toContain('17:26');
  });

  it('still shows a percentage that says something', () => {
    const view = toHtml({ ...base, totalSeconds: 3300, plannedSeconds: 3600 }, [{ sport: 'bike', plannedDuration: 3600 }]);
    expect(view).toContain('92%');
  });
});
