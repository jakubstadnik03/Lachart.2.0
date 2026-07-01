import React, { useMemo } from 'react';
import { buildRunKmSplits, formatSplitPace } from '../../utils/runKmSplits';

/**
 * Strava-style per-km splits table for running activities.
 * Cadence column appears only when at least one split has cadence data.
 */
export default function RunSplitsTable({
  laps = [],
  records = [],
  lapTimeSource = 'fit',
  className = '',
}) {
  const splits = useMemo(
    () => buildRunKmSplits(laps, records, { lapTimeSource }),
    [laps, records, lapTimeSource]
  );

  const hasCadence = useMemo(
    () => splits.some((s) => s.cadence != null && s.cadence > 0),
    [splits]
  );

  const splitsGrid = hasCadence
    ? 'grid-cols-[22px_44px_minmax(48px,1fr)_36px_40px_40px]'
    : 'grid-cols-[22px_44px_minmax(48px,1fr)_36px_40px]';

  const barRange = useMemo(() => {
    const paces = splits.map((s) => s.paceSecPerKm).filter((p) => p > 0);
    if (paces.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...paces), max: Math.max(...paces) };
  }, [splits]);

  if (splits.length < 1) return null;

  const barWidthPct = (paceSecPerKm) => {
    const { min, max } = barRange;
    if (!paceSecPerKm || max <= min) return 50;
    const ratio = (max - paceSecPerKm) / (max - min);
    return 8 + ratio * 92;
  };

  return (
    <div className={`px-4 py-3 border-b border-gray-100 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">Splits</h3>

      <div className="w-full max-w-md">
        <div className={`grid ${splitsGrid} gap-x-2 items-center mb-1`}>
          <div className="text-[10px] font-medium text-gray-400">Km</div>
          <div className="text-[10px] font-medium text-gray-400">Pace</div>
          <div />
          <div className="text-[10px] font-medium text-gray-400 text-right">Elev</div>
          <div className="text-[10px] font-medium text-gray-400 text-right">HR</div>
          {hasCadence && (
            <div className="text-[10px] font-medium text-gray-400 text-right">spm</div>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {splits.map((split) => (
            <div
              key={split.km}
              className={`grid ${splitsGrid} gap-x-2 items-center py-1.5`}
            >
              <div className="text-[13px] font-semibold text-gray-900 tabular-nums">{split.km}</div>
              <div className="text-[13px] font-semibold text-gray-900 tabular-nums whitespace-nowrap">
                {formatSplitPace(split.paceSecPerKm)}
              </div>
              <div className="flex items-center h-3.5 min-w-0">
                <div
                  className="h-2 rounded-full bg-[#3b82f6]"
                  style={{ width: `${barWidthPct(split.paceSecPerKm)}%`, minWidth: 4 }}
                />
              </div>
              <div className="text-[13px] font-medium text-gray-700 tabular-nums text-right">
                {split.elev != null ? split.elev : '—'}
              </div>
              <div className="text-[13px] font-medium text-gray-700 tabular-nums text-right">
                {split.hr != null ? split.hr : '—'}
              </div>
              {hasCadence && (
                <div className="text-[13px] font-medium text-gray-700 tabular-nums text-right">
                  {split.cadence != null && split.cadence > 0 ? split.cadence : '—'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
