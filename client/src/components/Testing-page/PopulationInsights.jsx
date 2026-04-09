import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import api from '../../services/api';

const formatTooltipAxisLabel = (label, decimals = 2) => {
  const n = Number(label);
  return Number.isFinite(n) ? n.toFixed(decimals) : String(label ?? '—');
};

/** Human-readable % of athletes in one histogram bin (tooltip). */
const formatSampleShare = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '—');
  const rounded = Math.round(n * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
};

/**
 * API returns `distribution` as number[] (histogram bin heights, % of sample per bin).
 * Recharts AreaChart expects rows with `x` (value axis) and `y` (density).
 */
const histogramToChartPoints = (metric, { xScale = 1 } = {}) => {
  if (!metric?.distribution?.length) return [];
  const min = Number(metric.min);
  const max = Number(metric.max);
  const distribution = metric.distribution;
  const bins = distribution.length;
  if (!Number.isFinite(min) || !Number.isFinite(max) || bins <= 0) return [];

  const span = max - min;
  if (span <= 0) {
    const y0 = Number(distribution[0]);
    return [{ x: min * xScale, y: Number.isFinite(y0) ? y0 : 0 }];
  }

  const binWidth = span / bins;
  return distribution.map((raw, i) => ({
    x: (min + (i + 0.5) * binWidth) * xScale,
    y: Number(raw) || 0,
  }));
};

const CHART_COLORS = {
  bar: '#6366f1',
  you: '#ef4444',
};

/**
 * Histogram: % of the selected group in each value range (binned on the server).
 * Bars match the underlying data better than a smooth area curve.
 */
const PopulationHistogram = ({
  data,
  xTickDecimals,
  xAxisLabel,
  tooltipTitle,
  referenceX,
  showReference,
  count,
  footerStats,
  chartHeightClass = 'h-48',
}) => {
  const tickFmt = (v) => formatTooltipAxisLabel(v, xTickDecimals);
  const smallSample = count < 30;

  return (
    <div>
      <div className={`${chartHeightClass} min-h-[11rem] w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 6, left: 2, bottom: 4 }}
            barCategoryGap="12%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 10 }}
              tickFormatter={tickFmt}
              label={{
                value: xAxisLabel,
                position: 'insideBottom',
                offset: -2,
                style: { fontSize: 10, fill: '#6b7280' },
              }}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              width={36}
              tickFormatter={(v) => `${formatSampleShare(v)}%`}
              label={{
                value: '% of group',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 9, fill: '#9ca3af' },
                offset: 4,
              }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(99, 102, 241, 0.06)' }}
              formatter={(value) => [`${formatSampleShare(value)}%`, 'Share of group']}
              labelFormatter={(label) => `${tooltipTitle}: ${tickFmt(label)}`}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)',
              }}
            />
            <Bar
              dataKey="y"
              fill={CHART_COLORS.bar}
              radius={[3, 3, 0, 0]}
              maxBarSize={48}
              isAnimationActive={false}
            />
            {showReference && referenceX != null && Number.isFinite(Number(referenceX)) && (
              <ReferenceLine
                x={referenceX}
                stroke={CHART_COLORS.you}
                strokeWidth={2}
                strokeDasharray="4 3"
                label={{
                  value: 'You',
                  position: 'top',
                  fill: CHART_COLORS.you,
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
          {footerStats.map(({ label, value }) => (
            <span key={label}>
              <span className="text-gray-400">{label}</span>{' '}
              <span className="font-medium text-gray-800">{value}</span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: CHART_COLORS.bar }} />
            Group
          </span>
          {showReference && (
            <span className="flex items-center gap-1.5 text-gray-500">
              <span
                className="inline-block h-0 w-4 border-t-2 border-dashed"
                style={{ borderColor: CHART_COLORS.you }}
              />
              You
            </span>
          )}
        </div>
      </div>
      {smallSample && (
        <p className="mt-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900 ring-1 ring-amber-200/80">
          <span className="font-medium">Small sample ({count}).</span> This is a rough spread, not a smooth
          &ldquo;population curve&rdquo; — it will look steadier as more athletes appear in this group.
        </p>
      )}
    </div>
  );
};

const PopulationInsights = ({ athleteProfile, selectedSport = 'bike' }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedGender, setSelectedGender] = useState('male');

  useEffect(() => {
    const loadStats = async () => {
      if (!athleteProfile || selectedSport === 'all') return;
      
      setLoading(true);
      try {
        const response = await api.get('/test/population-stats', {
          params: {
            gender: selectedGender,
            sport: selectedSport === 'bike' ? 'bike' : selectedSport === 'run' ? 'run' : null
          }
        });
        setStats(response.data);
      } catch (error) {
        console.error('Failed to load population stats:', error);
        setStats(null);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [athleteProfile, selectedGender, selectedSport]);

  if (selectedSport === 'all') {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="text-center py-4 text-gray-500 text-sm">
          Loading population statistics...
        </div>
      </div>
    );
  }

  if (!stats || !stats[selectedSport]) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Population Comparison</h3>
        <p className="text-xs text-gray-500 mb-2">
          Compare your performance metrics with other athletes in the database.
        </p>
        <div className="text-center py-4 text-gray-500 text-sm">
          <p className="mb-2">Population statistics not available yet.</p>
          <p className="text-xs text-gray-400">
            Statistics are calculated from athletes who have set their power zones (LT1/LT2) in their profile.
            More data will be available as more athletes complete their profiles.
          </p>
        </div>
      </div>
    );
  }

  const sportStats = stats[selectedSport];
  
  // Get current user's values
  const getCurrentValues = () => {
    if (!athleteProfile?.powerZones) return null;
    
    const zones = athleteProfile.powerZones[selectedSport === 'bike' ? 'cycling' : 'running'];
    if (!zones?.lt1 || !zones?.lt2) return null;
    
    // Decimal LT1/LT2 (same units as population API stats for percentiles & chart)
    const ratio = zones.lt1 / zones.lt2;
    const lt1Wkg = selectedSport === 'bike' && athleteProfile.weight ? zones.lt1 / athleteProfile.weight : null;
    const lt2Wkg = selectedSport === 'bike' && athleteProfile.weight ? zones.lt2 / athleteProfile.weight : null;
    
    return {
      lt1: zones.lt1,
      lt2: zones.lt2,
      ratio,
      lt1Wkg,
      lt2Wkg
    };
  };

  const currentValues = getCurrentValues();
  
  // Calculate percentile
  const calculatePercentile = (value, stats) => {
    if (value === null || value === undefined || !stats || !stats.distribution || stats.count === 0) return null;
    
    const z = (value - stats.mean) / stats.sd;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    
    let percentile = z > 0 ? (1 - p) * 100 : p * 100;
    return Math.max(0, Math.min(100, percentile));
  };

  // Format value
  const formatValue = (value, type) => {
    if (value === null || value === undefined) return '-';
    if (type === 'ratio') {
      return `${(value * 100).toFixed(1)}%`;
    }
    if (type === 'wkg') {
      return `${value.toFixed(2)} W/kg`;
    }
    if (selectedSport === 'run') {
      const mins = Math.floor(value / 60);
      const secs = Math.round(value % 60);
      return `${mins}:${String(secs).padStart(2, '0')} /km`;
    }
    return `${Math.round(value)}W`;
  };

  // Check if metric has data
  const hasData = (metric) => {
    return metric && metric.count > 0;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Population Comparison ({selectedSport === 'bike' ? 'Cycling' : 'Running'})</h3>
        <p className="text-xs text-gray-500 mb-3">
          Compare your performance with other {selectedGender} athletes who have set their power zones.
        </p>
        
        {/* Gender selector */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setSelectedGender('male')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              selectedGender === 'male'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Male
          </button>
          <button
            onClick={() => setSelectedGender('female')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              selectedGender === 'female'
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Female
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50/90 to-white px-3 py-2.5 text-xs leading-relaxed text-gray-700 ring-1 ring-indigo-100/80">
        <p className="font-medium text-indigo-950">How to read these charts</p>
        <p className="mt-1 text-gray-600">
          Each bar is a <span className="font-medium text-gray-800">range of values</span> (split into 20 buckets from min to max in this group).
          Height = <span className="font-medium text-gray-800">what % of athletes</span> in this gender group fall in that range — not a training score.
          The dashed red line is <span className="font-medium text-gray-800">your</span> value when we have it.
        </p>
      </div>

      {/* W/kg graphs for bike */}
      {selectedSport === 'bike' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {hasData(sportStats.lt1Wkg) && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">LT1 (W/kg)</h4>
                  <p className="mt-0.5 text-[11px] text-gray-500">First lactate threshold, relative to body weight</p>
                </div>
                {currentValues?.lt1Wkg && (
                  <div className="text-right text-xs">
                    <span className="font-medium text-primary">
                      You {formatValue(currentValues.lt1Wkg, 'wkg')}
                    </span>
                    {calculatePercentile(currentValues.lt1Wkg, sportStats.lt1Wkg) != null && (
                      <span className="block text-gray-500">
                        ~{calculatePercentile(currentValues.lt1Wkg, sportStats.lt1Wkg).toFixed(0)}th percentile vs group
                      </span>
                    )}
                  </div>
                )}
              </div>
              {!currentValues?.lt1Wkg && (
                <p className="mb-3 text-xs text-amber-700">Add weight in your profile to compare W/kg and see your line.</p>
              )}
              <PopulationHistogram
                data={histogramToChartPoints(sportStats.lt1Wkg)}
                xTickDecimals={2}
                xAxisLabel="W/kg"
                tooltipTitle="LT1"
                referenceX={currentValues?.lt1Wkg}
                showReference={!!currentValues?.lt1Wkg}
                count={sportStats.lt1Wkg.count}
                footerStats={[
                  { label: 'Avg', value: formatValue(sportStats.lt1Wkg.mean, 'wkg') },
                  { label: 'Median', value: formatValue(sportStats.lt1Wkg.median, 'wkg') },
                  { label: 'n', value: String(sportStats.lt1Wkg.count) },
                ]}
              />
            </div>
          )}

          {hasData(sportStats.lt2Wkg) && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-100">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">LT2 (W/kg)</h4>
                  <p className="mt-0.5 text-[11px] text-gray-500">Second threshold (MLSS), relative to body weight</p>
                </div>
                {currentValues?.lt2Wkg && (
                  <div className="text-right text-xs">
                    <span className="font-medium text-primary">
                      You {formatValue(currentValues.lt2Wkg, 'wkg')}
                    </span>
                    {calculatePercentile(currentValues.lt2Wkg, sportStats.lt2Wkg) != null && (
                      <span className="block text-gray-500">
                        ~{calculatePercentile(currentValues.lt2Wkg, sportStats.lt2Wkg).toFixed(0)}th percentile vs group
                      </span>
                    )}
                  </div>
                )}
              </div>
              {!currentValues?.lt2Wkg && (
                <p className="mb-3 text-xs text-amber-700">Add weight in your profile to compare W/kg and see your line.</p>
              )}
              <PopulationHistogram
                data={histogramToChartPoints(sportStats.lt2Wkg)}
                xTickDecimals={2}
                xAxisLabel="W/kg"
                tooltipTitle="LT2"
                referenceX={currentValues?.lt2Wkg}
                showReference={!!currentValues?.lt2Wkg}
                count={sportStats.lt2Wkg.count}
                footerStats={[
                  { label: 'Avg', value: formatValue(sportStats.lt2Wkg.mean, 'wkg') },
                  { label: 'Median', value: formatValue(sportStats.lt2Wkg.median, 'wkg') },
                  { label: 'n', value: String(sportStats.lt2Wkg.count) },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {hasData(sportStats.lt1Lt2Ratio) && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-100">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">LT1 / LT2 ratio</h4>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Lower % = wider gap between thresholds (often more room for endurance vs threshold work)
              </p>
            </div>
            {currentValues?.ratio && (
              <div className="text-right text-xs">
                <span className="font-medium text-primary">You {formatValue(currentValues.ratio, 'ratio')}</span>
                {calculatePercentile(currentValues.ratio, sportStats.lt1Lt2Ratio) != null && (
                  <span className="block text-gray-500">
                    ~{calculatePercentile(currentValues.ratio, sportStats.lt1Lt2Ratio).toFixed(0)}th percentile vs group
                  </span>
                )}
              </div>
            )}
          </div>
          <PopulationHistogram
            data={histogramToChartPoints(sportStats.lt1Lt2Ratio, { xScale: 100 })}
            xTickDecimals={1}
            xAxisLabel="Ratio (%)"
            tooltipTitle="LT1/LT2"
            referenceX={currentValues?.ratio != null ? currentValues.ratio * 100 : undefined}
            showReference={!!currentValues?.ratio}
            count={sportStats.lt1Lt2Ratio.count}
            footerStats={[
              { label: 'Avg', value: formatValue(sportStats.lt1Lt2Ratio.mean, 'ratio') },
              { label: 'Median', value: formatValue(sportStats.lt1Lt2Ratio.median, 'ratio') },
              { label: 'n', value: String(sportStats.lt1Lt2Ratio.count) },
            ]}
          />
        </div>
      )}

      {/* Show message if no data available */}
      {!hasData(sportStats.lt1Wkg) && !hasData(sportStats.lt2Wkg) && !hasData(sportStats.lt1Lt2Ratio) && (
        <div className="text-center py-4 text-gray-500 text-sm">
          <p className="mb-2">Not enough data available for {selectedGender} {selectedSport} athletes.</p>
          <p className="text-xs text-gray-400">
            Statistics are calculated from athletes who have set their power zones (LT1/LT2) in their profile.
            More data will be available as more athletes complete their profiles.
          </p>
        </div>
      )}
    </div>
  );
};

export default PopulationInsights;
