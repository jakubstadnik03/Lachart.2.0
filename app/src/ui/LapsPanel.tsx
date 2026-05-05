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
  index: number;       // 1-based
  distance: number;    // meters
  duration: number;    // seconds
  pace: number | null; // sec/100m (swim), sec/km (run), null for rest
  paceUnit: string;
  hr: number | null;
  power: number | null;
  isPause: boolean;
}

interface Props {
  laps: any[];
  sport: string;
  sourceType: 'strava' | 'fit' | 'regular';
}

// ─── Lap normalisation ────────────────────────────────────────────────────────

function normalizeLap(raw: any, index: number, sport: string, sourceType: string): NormalizedLap {
  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');

  let distance = 0;
  let duration = 0;
  let hr: number | null = null;
  let power: number | null = null;
  let speed: number | null = null;

  if (sourceType === 'strava') {
    distance = Number(raw.distance ?? 0);
    duration = Number(raw.elapsed_time ?? raw.moving_time ?? 0);
    hr = raw.average_heartrate != null ? Number(raw.average_heartrate) : null;
    power = raw.average_watts != null ? Number(raw.average_watts) : null;
    speed = raw.average_speed != null ? Number(raw.average_speed) : null;
  } else {
    // FIT
    distance = Number(raw.totalDistance ?? raw.distance ?? 0);
    duration = Number(raw.totalElapsedTime ?? raw.totalTimerTime ?? raw.duration ?? 0);
    hr = raw.avgHeartRate != null ? Number(raw.avgHeartRate) : null;
    power = raw.avgPower != null ? Number(raw.avgPower) : null;
    speed = raw.avgSpeed != null ? Number(raw.avgSpeed) : null;
  }

  // Fallback: compute pace from distance + duration when speed not available
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
      // Bike / other: store speed in km/h as positive number for chart, pace = null
      paceUnit = 'km/h';
    }
  }

  return { index, distance, duration, pace, paceUnit, hr, power, isPause };
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 140;
const BAR_WIDTH = 18;
const BAR_GAP = 4;
const BAR_SLOT = BAR_WIDTH + BAR_GAP;
const Y_AXIS_WIDTH = 40;

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
  onBarPress: (index: number) => void;
  chartRef: React.RefObject<ScrollView>;
}) {
  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');
  const isBike = sportLow.includes('bike') || sportLow.includes('cycl') || sportLow.includes('ride');

  // For swim/run: pace chart (higher bar = slower)
  // For bike: speed chart (higher bar = faster) or power
  const values = laps.map((l) => {
    if (l.isPause) return 0;
    if ((isSwim || isRun) && l.pace) return l.pace;
    if (isBike && l.power) return l.power;
    if (l.distance > 0 && l.duration > 0) return (l.distance / l.duration) * 3.6; // km/h
    return 0;
  });

  const nonZero = values.filter((v) => v > 0);
  const maxVal = nonZero.length ? Math.max(...nonZero) : 1;
  const minVal = nonZero.length ? Math.min(...nonZero) : 0;
  const range = maxVal - minVal || 1;

  // Y-axis labels (5 ticks from fast to slow for pace, slow to fast for speed)
  const yLabels = useMemo(() => {
    const ticks: string[] = [];
    const steps = 4;
    for (let i = steps; i >= 0; i--) {
      const v = minVal + (range * i) / steps;
      if (isSwim || isRun) {
        ticks.push(formatPaceSeconds(v, ''));
      } else {
        ticks.push(`${Math.round(v)}`);
      }
    }
    return ticks;
  }, [minVal, range, isSwim, isRun]);

  const getBarHeight = (val: number) => {
    if (!val) return 2;
    const ratio = (val - minVal) / range;
    // For pace: higher val = taller bar (slower is taller)
    // For speed/power: higher val = taller bar
    return Math.max(2, ratio * CHART_HEIGHT);
  };

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Y-axis */}
      <View style={{ width: Y_AXIS_WIDTH, height: CHART_HEIGHT, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4 }}>
        {yLabels.map((l, i) => (
          <Text key={i} style={styles.yLabel}>{l}</Text>
        ))}
      </View>

      {/* Bars */}
      <ScrollView
        ref={chartRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ height: CHART_HEIGHT, alignItems: 'flex-end', paddingRight: 8 }}
      >
        {laps.map((lap, i) => {
          const val = values[i];
          const barH = getBarHeight(val);
          const isSelected = i === selectedIndex;
          const isPause = lap.isPause;

          return (
            <TouchableOpacity
              key={i}
              onPress={() => onBarPress(i)}
              activeOpacity={0.7}
              style={{ width: BAR_SLOT, alignItems: 'center', justifyContent: 'flex-end', height: CHART_HEIGHT }}
            >
              <View
                style={{
                  width: BAR_WIDTH,
                  height: barH,
                  borderRadius: 3,
                  backgroundColor: isPause
                    ? '#E5E7EB'
                    : isSelected
                      ? '#2563EB'
                      : '#93C5FD',
                }}
              />
              {/* lap number under bar - only every Nth */}
              {(i % Math.ceil(laps.length / 8) === 0 || isSelected) ? (
                <Text style={[styles.barLabel, isSelected && { color: '#2563EB', fontWeight: '800' }]}>
                  {lap.index}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

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

  const distLabel = lap.distance > 0 ? `${Math.round(lap.distance)} m` : '—';
  const timeLabel = lap.duration > 0 ? formatDuration(lap.duration) : '—';

  let metricLabel = '—';
  if (!lap.isPause) {
    if ((isSwim || isRun) && lap.pace) {
      metricLabel = formatPaceSeconds(lap.pace, lap.paceUnit);
    } else if (isBike && lap.power) {
      metricLabel = `${Math.round(lap.power)} W`;
    } else if (lap.distance > 0 && lap.duration > 0) {
      const kmh = (lap.distance / lap.duration) * 3.6;
      metricLabel = `${kmh.toFixed(1)} km/h`;
    }
  }

  const hrLabel = lap.hr ? `${Math.round(lap.hr)}` : '—';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.tableRow, isSelected && styles.tableRowSelected]}
    >
      <Text style={[styles.colNum, isSelected && styles.selectedText]}>{lap.index}</Text>
      <Text style={[styles.colDist, isSelected && styles.selectedText]}>{distLabel}</Text>
      <Text style={[styles.colTime, isSelected && styles.selectedText]}>{timeLabel}</Text>
      <Text style={[styles.colMetric, isSelected && styles.selectedText]}>{metricLabel}</Text>
      <Text style={[styles.colHr, isSelected && styles.selectedText]}>{hrLabel}</Text>
    </TouchableOpacity>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LapsPanel({ laps, sport, sourceType }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const chartScrollRef = useRef<ScrollView>(null);
  const tableScrollRef = useRef<ScrollView>(null);

  const normalized = useMemo(
    () => laps.map((l, i) => normalizeLap(l, i + 1, sport, sourceType)),
    [laps, sport, sourceType]
  );

  const selectedLap = normalized[selectedIndex];

  const sportLow = (sport || '').toLowerCase();
  const isSwim = sportLow.includes('swim');
  const isRun = sportLow.includes('run');
  const isBike = sportLow.includes('bike') || sportLow.includes('cycl') || sportLow.includes('ride');

  const metricHeader = isSwim ? '/100m' : isRun ? '/km' : isBike ? 'Power' : 'Pace';

  const selectedMetricLabel = useMemo(() => {
    if (!selectedLap || selectedLap.isPause) return `0 ${isSwim ? 's/100m' : isRun ? 's/km' : 'W'}`;
    if ((isSwim || isRun) && selectedLap.pace) return formatPaceSeconds(selectedLap.pace, selectedLap.paceUnit);
    if (isBike && selectedLap.power) return `${Math.round(selectedLap.power)} W`;
    if (selectedLap.distance > 0 && selectedLap.duration > 0) {
      const kmh = (selectedLap.distance / selectedLap.duration) * 3.6;
      return `${kmh.toFixed(1)} km/h`;
    }
    return '—';
  }, [selectedLap, isSwim, isRun, isBike]);

  const handleBarPress = useCallback((index: number) => {
    setSelectedIndex(index);
    // Scroll chart to keep bar visible (center on it)
    const offset = Math.max(0, index * BAR_SLOT - 120);
    chartScrollRef.current?.scrollTo({ x: offset, animated: true });
    // Scroll table to the row
    tableScrollRef.current?.scrollTo({ y: index * ROW_HEIGHT, animated: true });
  }, []);

  const handleRowPress = useCallback((index: number) => {
    setSelectedIndex(index);
    // Scroll chart to bar
    const offset = Math.max(0, index * BAR_SLOT - 120);
    chartScrollRef.current?.scrollTo({ x: offset, animated: true });
  }, []);

  return (
    <View style={styles.container}>
      {/* Selected lap header */}
      <View style={styles.selectedHeader}>
        <Text style={styles.selectedLapTitle}>
          Lap {selectedLap?.index ?? 1}
        </Text>
        <Text style={styles.selectedLapMeta}>
          {selectedLap ? formatDuration(selectedLap.duration) : '—'}
          {'  ·  '}
          {selectedMetricLabel}
        </Text>
      </View>

      {/* Chart */}
      <LapChart
        laps={normalized}
        selectedIndex={selectedIndex}
        sport={sport}
        onBarPress={handleBarPress}
        chartRef={chartScrollRef}
      />

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colNum, styles.headerText]}>#</Text>
        <Text style={[styles.colDist, styles.headerText]}>DIST</Text>
        <Text style={[styles.colTime, styles.headerText]}>TIME</Text>
        <Text style={[styles.colMetric, styles.headerText]}>{metricHeader}</Text>
        <Text style={[styles.colHr, styles.headerText]}>HR</Text>
      </View>

      {/* Scrollable table */}
      <ScrollView
        ref={tableScrollRef}
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
            onPress={() => handleRowPress(i)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Selected lap header
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 8,
  },
  selectedLapTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  selectedLapMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },

  // Y axis
  yLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '600',
    textAlign: 'right',
  },

  // Bar label
  barLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 2,
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginTop: 12,
  },
  headerText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  table: {
    maxHeight: 320,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    height: ROW_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  tableRowSelected: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderBottomColor: '#DBEAFE',
  },
  selectedText: {
    color: '#1D4ED8',
  },

  // Columns
  colNum: {
    width: 30,
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  colDist: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
  },
  colTime: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    fontWeight: '800',
    textAlign: 'center',
  },
  colMetric: {
    flex: 1.2,
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    textAlign: 'center',
  },
  colHr: {
    width: 40,
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    textAlign: 'right',
  },
});
