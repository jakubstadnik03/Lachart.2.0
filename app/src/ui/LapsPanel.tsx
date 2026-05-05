import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatDuration, formatPaceSeconds, paceFromSpeed } from './format';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedLap {
  index: number;
  distance: number;   // meters
  duration: number;   // seconds
  pace: number | null; // sec/100m or sec/km
  paceUnit: string;   // '/100m' | '/km' | 'km/h'
  hr: number | null;
  power: number | null;
  isPause: boolean;
}

interface Props {
  laps: any[];
  sport: string;
  sourceType: 'strava' | 'fit' | 'regular';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeLap(raw: any, index: number, sport: string, sourceType: string): NormalizedLap {
  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');

  let distance = 0, duration = 0;
  let hr: number | null = null, power: number | null = null, speed: number | null = null;

  if (sourceType === 'strava') {
    distance = Number(raw.distance ?? 0);
    duration = Number(raw.elapsed_time ?? raw.moving_time ?? 0);
    hr = raw.average_heartrate != null ? Number(raw.average_heartrate) : null;
    power = raw.average_watts != null ? Number(raw.average_watts) : null;
    speed = raw.average_speed != null ? Number(raw.average_speed) : null;
  } else {
    distance = Number(raw.totalDistance ?? raw.distance ?? 0);
    duration = Number(raw.totalElapsedTime ?? raw.totalTimerTime ?? raw.duration ?? 0);
    hr = raw.avgHeartRate != null ? Number(raw.avgHeartRate) : null;
    power = raw.avgPower != null ? Number(raw.avgPower) : null;
    speed = raw.avgSpeed != null ? Number(raw.avgSpeed) : null;
  }

  if ((!speed || speed <= 0) && distance > 0 && duration > 0) {
    speed = distance / duration;
  }

  const isPause = distance <= 0;
  let pace: number | null = null;
  let paceUnit = '/km';

  if (!isPause && speed && speed > 0) {
    if (isSwim) {
      pace = paceFromSpeed(speed, 'swim');
      paceUnit = '/100m';
    } else if (isRun) {
      pace = paceFromSpeed(speed, 'run');
      paceUnit = '/km';
    } else {
      paceUnit = 'km/h';
    }
  }

  return { index, distance, duration, pace, paceUnit, hr, power, isPause };
}

/** Format duration Garmin-style: "41s" under 1 min, "1:20" over 1 min */
function formatLapTime(secs: number): string {
  if (secs <= 0) return '0s';
  if (secs < 60) return `${Math.round(secs)}s`;
  return formatDuration(secs);
}

/** Format pace as "1:38 /100m" or "0s /100m" */
function formatLapPace(pace: number | null, unit: string): string {
  if (!pace) return `0s ${unit}`;
  if (pace < 60) return `${Math.round(pace)}s ${unit}`;
  const mm = Math.floor(pace / 60);
  const ss = Math.round(pace % 60);
  return `${mm}:${String(ss).padStart(2, '0')} ${unit}`;
}

/** Format distance as "600 m", "0 m" */
function formatLapDist(meters: number): string {
  if (!meters || meters <= 0) return '0 m';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const CHART_H = 160;
const BAR_W = 22;
const BAR_GAP = 6;
const BAR_SLOT = BAR_W + BAR_GAP;
const Y_AXIS_W = 44;
const DOT_R = 5; // rest lap dot radius

function LapChart({
  laps,
  selectedIndex,
  sport,
  onBarPress,
  chartRef,
}: {
  laps: NormalizedLap[];
  selectedIndex: number;
  sport: string;
  onBarPress: (i: number) => void;
  chartRef: React.RefObject<ScrollView>;
}) {
  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');
  const isBike = sportLow.includes('bike') || sportLow.includes('cycl') || sportLow.includes('ride');

  // Build value array (pace for swim/run, power/speed for bike)
  const values = laps.map((l) => {
    if (l.isPause) return 0;
    if ((isSwim || isRun) && l.pace) return l.pace;
    if (isBike && l.power) return l.power;
    if (l.distance > 0 && l.duration > 0) return (l.distance / l.duration) * 3.6;
    return 0;
  });

  const nonZero = values.filter((v) => v > 0);
  if (!nonZero.length) return null;

  const maxVal = Math.max(...nonZero);
  const minVal = Math.min(...nonZero);
  // Add padding: 10% above and below
  const pad = (maxVal - minVal) * 0.15 || maxVal * 0.1;
  const chartMin = Math.max(0, minVal - pad);
  const chartMax = maxVal + pad;
  const range = chartMax - chartMin || 1;

  // Y-axis: 5 ticks from top (fastest/smallest) to bottom (slowest/largest)
  const yTicks = 5;
  const yLabels: string[] = [];
  for (let i = 0; i < yTicks; i++) {
    const v = chartMin + (range * i) / (yTicks - 1);
    if (isSwim || isRun) {
      yLabels.push(formatPaceSeconds(v, ''));
    } else {
      yLabels.push(`${Math.round(v)}`);
    }
  }

  // Bar height: taller = slower (higher pace value)
  const getBarH = (val: number) => {
    if (!val) return DOT_R * 2;
    const ratio = (val - chartMin) / range;
    return Math.max(4, ratio * CHART_H);
  };

  // Which lap indices to label on X axis
  const step = Math.max(1, Math.ceil(laps.length / 8));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {/* Y-axis labels - top to bottom = min to max */}
      <View style={{ width: Y_AXIS_W, height: CHART_H + 18, justifyContent: 'flex-start', paddingTop: 0 }}>
        {yLabels.map((label, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: (i / (yTicks - 1)) * CHART_H - 7,
              right: 6,
            }}
          >
            <Text style={styles.yLabel}>{label}</Text>
          </View>
        ))}
        {/* Unit label at bottom */}
        <View style={{ position: 'absolute', bottom: 0, right: 6 }}>
          <Text style={styles.yUnitLabel}>
            {isSwim ? '/100m' : isRun ? '/km' : isBike ? 'W' : ''}
          </Text>
        </View>
      </View>

      {/* Horizontal bar chart */}
      <ScrollView
        ref={chartRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingRight: 12 }}
      >
        <View style={{ height: CHART_H + 18 }}>
          {laps.map((lap, i) => {
            const val = values[i];
            const barH = getBarH(val);
            const isSelected = i === selectedIndex;
            const showLabel = i % step === 0 || isSelected;

            return (
              <TouchableOpacity
                key={i}
                onPress={() => onBarPress(i)}
                activeOpacity={0.75}
                style={{
                  position: 'absolute',
                  left: i * BAR_SLOT,
                  width: BAR_SLOT,
                  height: CHART_H + 18,
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                }}
              >
                {/* Bar or dot for rest laps */}
                {lap.isPause ? (
                  <View
                    style={{
                      width: DOT_R * 2,
                      height: DOT_R * 2,
                      borderRadius: DOT_R,
                      backgroundColor: isSelected ? '#93C5FD' : '#BFDBFE',
                      marginBottom: 14,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: BAR_W,
                      height: barH,
                      borderRadius: 4,
                      backgroundColor: isSelected ? '#93C5FD' : '#1D4ED8',
                      marginBottom: 14,
                    }}
                  />
                )}
                {/* X label */}
                <Text
                  style={[
                    styles.xLabel,
                    isSelected && { color: '#2563EB', fontWeight: '700' },
                  ]}
                >
                  {showLabel ? lap.index : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
          {/* Invisible spacer so content width is right */}
          <View style={{ width: laps.length * BAR_SLOT, height: 1 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

const ROW_H = 48;

function LapRow({
  lap,
  isSelected,
  sport,
  onPress,
}: {
  lap: NormalizedLap;
  isSelected: boolean;
  sport: string;
  onPress: () => void;
}) {
  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');
  const isBike = sportLow.includes('bike') || sportLow.includes('cycl') || sportLow.includes('ride');

  let paceLabel = '—';
  if (!lap.isPause) {
    if ((isSwim || isRun) && lap.pace) {
      paceLabel = formatLapPace(lap.pace, lap.paceUnit);
    } else if (isBike && lap.power) {
      paceLabel = `${Math.round(lap.power)} W`;
    } else if (lap.distance > 0 && lap.duration > 0) {
      const kmh = (lap.distance / lap.duration) * 3.6;
      paceLabel = `${kmh.toFixed(1)} km/h`;
    }
  } else {
    paceLabel = `0s ${lap.paceUnit}`;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={[styles.row, isSelected && styles.rowSelected]}
    >
      {/* Left selected indicator */}
      <View style={[styles.rowIndicator, isSelected && styles.rowIndicatorActive]} />

      <Text style={[styles.colIdx, isSelected && styles.colIdxSelected]}>{lap.index}</Text>
      <Text style={[styles.colDist]}>{formatLapDist(lap.distance)}</Text>
      <Text style={[styles.colTime]}>{formatLapTime(lap.duration)}</Text>
      <Text style={[styles.colPace]}>{paceLabel}</Text>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LapsPanel({ laps, sport, sourceType }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const chartRef = useRef<ScrollView>(null);
  const tableRef = useRef<ScrollView>(null);

  const normalized = useMemo(
    () => laps.map((l, i) => normalizeLap(l, i + 1, sport, sourceType)),
    [laps, sport, sourceType],
  );

  const sel = normalized[selectedIndex];

  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');
  const isBike = sportLow.includes('bike') || sportLow.includes('cycl') || sportLow.includes('ride');

  const selPaceLabel = useMemo(() => {
    if (!sel || sel.isPause) return `0s ${isSwim ? '/100m' : isRun ? '/km' : ''}`;
    if ((isSwim || isRun) && sel.pace) return formatLapPace(sel.pace, sel.paceUnit);
    if (isBike && sel.power) return `${Math.round(sel.power)} W`;
    if (sel.distance > 0 && sel.duration > 0) {
      return `${((sel.distance / sel.duration) * 3.6).toFixed(1)} km/h`;
    }
    return '—';
  }, [sel, isSwim, isRun, isBike]);

  const handleSelect = useCallback((index: number) => {
    setSelectedIndex(index);
    const barOffset = Math.max(0, index * BAR_SLOT - 120);
    chartRef.current?.scrollTo({ x: barOffset, animated: true });
    tableRef.current?.scrollTo({ y: index * ROW_H, animated: true });
  }, []);

  return (
    <View>
      {/* Selected lap header */}
      <View style={styles.header}>
        <Text style={styles.headerLap}>{sel?.index ?? 1}. kolo</Text>
        <Text style={styles.headerDot}> · </Text>
        <Text style={styles.headerPace}>{selPaceLabel}</Text>
      </View>

      {/* Chart */}
      <View style={styles.chartWrap}>
        <LapChart
          laps={normalized}
          selectedIndex={selectedIndex}
          sport={sport}
          onBarPress={handleSelect}
          chartRef={chartRef}
        />
      </View>

      {/* Table */}
      <ScrollView
        ref={tableRef}
        style={styles.table}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {normalized.map((lap, i) => (
          <LapRow
            key={i}
            lap={lap}
            isSelected={i === selectedIndex}
            sport={sport}
            onPress={() => handleSelect(i)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  headerLap: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  headerDot: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  headerPace: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  // Chart wrapper
  chartWrap: {
    marginBottom: 4,
  },

  // Y axis
  yLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textAlign: 'right',
  },
  yUnitLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
    textAlign: 'right',
  },

  // X axis labels
  xLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
    height: 14,
  },

  // Table
  table: {
    maxHeight: 340,
    marginTop: 8,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_H,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingRight: 4,
  },
  rowSelected: {
    backgroundColor: '#EFF6FF',
  },
  rowIndicator: {
    width: 3,
    height: ROW_H,
    marginRight: 8,
    backgroundColor: 'transparent',
  },
  rowIndicatorActive: {
    backgroundColor: '#2563EB',
    borderRadius: 2,
  },

  // Columns
  colIdx: {
    width: 32,
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  colIdxSelected: {
    color: '#2563EB',
    fontWeight: '800',
  },
  colDist: {
    width: 70,
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  colTime: {
    width: 60,
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  colPace: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    textAlign: 'right',
  },
});
