import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  distance: number;
  duration: number;
  pace: number | null;
  paceUnit: string;
  hr: number | null;
  power: number | null;
  weight: number;   // flex weight for normal mode
  isPause: boolean;
}

interface Props {
  laps: any[];
  sport: string;
  sourceType: 'strava' | 'fit' | 'regular';
}

// ─── Normalise ────────────────────────────────────────────────────────────────

function normalizeLap(raw: any, index: number, sport: string, sourceType: string): NormalizedLap {
  const sp = (sport || '').toLowerCase();
  const isSwim = sp.includes('swim');
  const isRun  = sp.includes('run');
  const isBike = sp.includes('bike') || sp.includes('cycl') || sp.includes('ride');

  let distance = 0, duration = 0;
  let hr: number | null = null, power: number | null = null, speed: number | null = null;

  if (sourceType === 'strava') {
    distance = Number(raw.distance ?? 0);
    duration = Number(raw.elapsed_time ?? raw.moving_time ?? 0);
    hr       = raw.average_heartrate != null ? Number(raw.average_heartrate) : null;
    power    = raw.average_watts != null ? Number(raw.average_watts) : null;
    speed    = raw.average_speed != null ? Number(raw.average_speed) : null;
  } else {
    distance = Number(raw.totalDistance ?? raw.distance ?? 0);
    duration = Number(raw.totalElapsedTime ?? raw.totalTimerTime ?? raw.duration ?? 0);
    hr       = raw.avgHeartRate != null ? Number(raw.avgHeartRate) : null;
    power    = raw.avgPower != null ? Number(raw.avgPower) : null;
    speed    = raw.avgSpeed != null ? Number(raw.avgSpeed) : null;
  }

  if ((!speed || speed <= 0) && distance > 0 && duration > 0) speed = distance / duration;

  const isPause = !isBike && distance <= 0;
  let pace: number | null = null;
  let paceUnit = '/km';

  if (!isPause && speed && speed > 0) {
    if (isSwim)      { pace = paceFromSpeed(speed, 'swim'); paceUnit = '/100m'; }
    else if (isRun)  { pace = paceFromSpeed(speed, 'run');  paceUnit = '/km';   }
    else               paceUnit = 'km/h';
  }

  // Width weight: distance for swim/run, duration for bike
  const weight = isBike ? Math.max(duration, 1) : Math.max(distance, 1);

  return { index, distance, duration, pace, paceUnit, hr, power, weight, isPause };
}

function fmtLapTime(secs: number): string {
  if (secs <= 0) return '0s';
  if (secs < 60)  return `${Math.round(secs)}s`;
  return formatDuration(secs);
}

function fmtLapPace(pace: number | null, unit: string): string {
  if (!pace) return `— ${unit}`;
  if (pace < 60) return `${Math.round(pace)}s ${unit}`;
  const mm = Math.floor(pace / 60), ss = Math.round(pace % 60);
  return `${mm}:${String(ss).padStart(2, '0')} ${unit}`;
}

function fmtLapDist(m: number): string {
  if (!m || m <= 0) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

// ─── Sport color ──────────────────────────────────────────────────────────────

function sportColor(sport: string): string {
  const s = (sport || '').toLowerCase();
  if (s.includes('swim'))  return '#06b6d4';   // cyan
  if (s.includes('run'))   return '#f97316';   // orange
  if (s.includes('bike') || s.includes('cycl') || s.includes('ride')) return '#3b82f6'; // blue
  return '#8b5cf6'; // purple
}

// ─── Chart ────────────────────────────────────────────────────────────────────

const CHART_H    = 140;
const Y_AXIS_W   = 44;
const X_LABEL_H  = 18;
const ZOOM_BAR_W = 28;
const ZOOM_GAP   = 4;
const ZOOM_SLOT  = ZOOM_BAR_W + ZOOM_GAP;
const PAUSE_W    = 8;

function LapChart({
  laps,
  sport,
  selectedIndex,
  onBarPress,
  chartRef,
}: {
  laps: NormalizedLap[];
  sport: string;
  selectedIndex: number;
  onBarPress: (i: number) => void;
  chartRef: React.RefObject<ScrollView>;
}) {
  const color   = sportColor(sport);
  const sp      = (sport || '').toLowerCase();
  const isSwim  = sp.includes('swim');
  const isRun   = sp.includes('run');
  const isBike  = sp.includes('bike') || sp.includes('cycl') || sp.includes('ride');
  const isZoomed = selectedIndex >= 0;

  const values = laps.map((l) => {
    if (l.isPause) return 0;
    if ((isSwim || isRun) && l.pace) return l.pace;
    if (isBike && l.power) return l.power;
    if (l.distance > 0 && l.duration > 0) return (l.distance / l.duration) * 3.6;
    return 0;
  });

  const nonZero = values.filter(v => v > 0);
  if (!nonZero.length) return null;

  const maxVal   = Math.max(...nonZero);
  const minVal   = Math.min(...nonZero);
  const pad      = (maxVal - minVal) * 0.15 || maxVal * 0.1;
  const chartMin = Math.max(0, minVal - pad);
  const range    = (maxVal + pad) - chartMin || 1;

  const getBarH = (val: number) => !val ? 3 : Math.max(3, ((val - chartMin) / range) * CHART_H);

  const fmtTick = (v: number) => {
    if (isBike) return `${Math.round(v)}`;
    const m = Math.floor(v / 60), s = Math.round(v % 60);
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  };
  const unitLabel = isSwim ? '/100m' : isRun ? '/km' : isBike ? 'W' : '';
  const yTicks = Array.from({ length: 5 }, (_, i) => chartMin + (range * i) / 4);

  const step = Math.max(1, Math.ceil(laps.length / 8));

  // Scroll to selected bar when zoomed
  useEffect(() => {
    if (!isZoomed || !chartRef.current) return;
    let left = 0;
    for (let i = 0; i < selectedIndex; i++) {
      left += (laps[i].isPause ? PAUSE_W : ZOOM_BAR_W) + ZOOM_GAP;
    }
    chartRef.current.scrollTo({ x: Math.max(0, left - 80), animated: true });
  }, [selectedIndex, isZoomed]);

  const totalWidth = laps.reduce(
    (s, l) => s + (l.isPause ? PAUSE_W : ZOOM_BAR_W) + ZOOM_GAP, 0
  );

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Y-axis */}
      <View style={{ width: Y_AXIS_W, height: CHART_H + X_LABEL_H, position: 'relative' }}>
        {yTicks.map((v, i) => (
          <Text
            key={i}
            style={[styles.yLabel, { position: 'absolute', top: (i / 4) * CHART_H - 6, right: 4 }]}
          >
            {fmtTick(v)}
          </Text>
        ))}
        <Text style={[styles.yLabel, { position: 'absolute', bottom: 0, right: 4 }]}>{unitLabel}</Text>
      </View>

      {/* Scrollable bars */}
      <ScrollView
        ref={chartRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: 'flex-end',
          height: CHART_H + X_LABEL_H,
          minWidth: isZoomed ? totalWidth : undefined,
          gap: isZoomed ? ZOOM_GAP : 1,
          paddingRight: 8,
        }}
      >
        {laps.map((lap, i) => {
          const isSelected = selectedIndex === i;
          const val  = values[i];
          const barH = getBarH(val);
          const showLabel = isZoomed ? isSelected : (i % step === 0);

          // Colors
          let barBg: string;
          if (lap.isPause)   barBg = isSelected ? color + '60' : '#E5E7EB';
          else if (isZoomed) barBg = isSelected ? color : color + '55';
          else               barBg = color + 'AA';

          const barWidth = isZoomed
            ? (lap.isPause ? PAUSE_W : ZOOM_BAR_W)
            : undefined; // proportional in normal mode

          return (
            <TouchableOpacity
              key={i}
              onPress={() => onBarPress(isSelected ? -1 : i)}
              activeOpacity={0.7}
              style={[
                styles.barItem,
                isZoomed
                  ? { width: lap.isPause ? PAUSE_W : ZOOM_BAR_W, flexShrink: 0 }
                  : { flex: lap.weight, minWidth: 2 },
                { height: CHART_H + X_LABEL_H },
              ]}
            >
              {lap.isPause ? (
                <View style={{ width: isZoomed ? 6 : 4, height: isZoomed ? 6 : 3, borderRadius: 3, backgroundColor: barBg, marginBottom: X_LABEL_H }} />
              ) : (
                <View style={{ width: barWidth ?? '100%', height: barH, backgroundColor: barBg, borderRadius: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginBottom: X_LABEL_H }} />
              )}
              {/* X-label + bottom indicator */}
              <View style={{ height: X_LABEL_H, alignItems: 'center', justifyContent: 'flex-start', width: '100%' }}>
                {isSelected && (
                  <View style={{ width: 6, height: 3, borderRadius: 2, backgroundColor: color, marginBottom: 2 }} />
                )}
                <Text style={[styles.xLabel, isSelected && { color, fontWeight: '700' }]}>
                  {showLabel ? lap.index : ''}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────

const ROW_H = 48;

function LapRow({ lap, isSelected, sport, color, onPress }: {
  lap: NormalizedLap; isSelected: boolean; sport: string; color: string; onPress: () => void;
}) {
  const sp = (sport || '').toLowerCase();
  const isSwim = sp.includes('swim');
  const isRun  = sp.includes('run');
  const isBike = sp.includes('bike') || sp.includes('cycl') || sp.includes('ride');

  let paceLabel = '—';
  if (!lap.isPause) {
    if ((isSwim || isRun) && lap.pace) paceLabel = fmtLapPace(lap.pace, lap.paceUnit);
    else if (isBike && lap.power)      paceLabel = `${Math.round(lap.power)} W`;
    else if (lap.distance > 0 && lap.duration > 0) {
      paceLabel = `${((lap.distance / lap.duration) * 3.6).toFixed(1)} km/h`;
    }
  } else {
    paceLabel = `— ${lap.paceUnit}`;
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6}
      style={[styles.row, isSelected && { backgroundColor: color + '14' }]}>
      <View style={[styles.rowIndicator, isSelected && { backgroundColor: color }]} />
      <Text style={[styles.colIdx, isSelected && { color, fontWeight: '800' }]}>{lap.index}</Text>
      <Text style={styles.colDist}>{fmtLapDist(lap.distance)}</Text>
      <Text style={styles.colTime}>{fmtLapTime(lap.duration)}</Text>
      <Text style={[styles.colPace, isSelected && { color }]}>{paceLabel}</Text>
      <Text style={styles.colHr}>{lap.hr ? `${Math.round(lap.hr)}` : '—'}</Text>
    </TouchableOpacity>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LapsPanel({ laps, sport, sourceType }: Props) {
  const [selectedIndex, setSelectedIndex] = useState(-1); // -1 = no selection (zoomed out)
  const chartRef  = useRef<ScrollView>(null);
  const tableRef  = useRef<ScrollView>(null);
  const color     = sportColor(sport);

  const normalized = useMemo(
    () => laps.map((l, i) => normalizeLap(l, i + 1, sport, sourceType)),
    [laps, sport, sourceType],
  );

  const sel = selectedIndex >= 0 ? normalized[selectedIndex] : null;

  const sp     = (sport || '').toLowerCase();
  const isSwim = sp.includes('swim');
  const isRun  = sp.includes('run');
  const isBike = sp.includes('bike') || sp.includes('cycl') || sp.includes('ride');

  const selPaceLabel = useMemo(() => {
    if (!sel || sel.isPause) return `— ${isSwim ? '/100m' : isRun ? '/km' : ''}`;
    if ((isSwim || isRun) && sel.pace) return fmtLapPace(sel.pace, sel.paceUnit);
    if (isBike && sel.power) return `${Math.round(sel.power)} W`;
    return '—';
  }, [sel, isSwim, isRun, isBike]);

  const handleSelect = useCallback((index: number) => {
    setSelectedIndex(index);
    if (index >= 0) {
      tableRef.current?.scrollTo({ y: index * ROW_H, animated: true });
    }
  }, []);

  return (
    <View>
      {/* Header */}
      <View style={styles.header}>
        {sel ? (
          <>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.headerLap}>Lap {sel.index}</Text>
              <Text style={styles.headerDot}>·</Text>
              <Text style={styles.headerDur}>{fmtLapTime(sel.duration)}</Text>
              <Text style={styles.headerDot}>·</Text>
              <Text style={[styles.headerPace, { color }]}>{selPaceLabel}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setSelectedIndex(-1)}
              style={[styles.zoomOutBtn, { borderColor: color + '40' }]}
            >
              <Text style={[styles.zoomOutText, { color }]}>zoom out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.headerHint}>
            {isSwim ? 'Laps · pace /100m' : isRun ? 'Laps · pace /km' : isBike ? 'Laps · power' : 'Laps'}
          </Text>
        )}
      </View>

      {/* Chart */}
      <LapChart
        laps={normalized}
        sport={sport}
        selectedIndex={selectedIndex}
        onBarPress={handleSelect}
        chartRef={chartRef}
      />

      {/* Table header */}
      <View style={styles.tableHeader}>
        <Text style={[styles.colIdx, styles.headerText]}>#</Text>
        <Text style={[styles.colDist, styles.headerText]}>DIST</Text>
        <Text style={[styles.colTime, styles.headerText]}>TIME</Text>
        <Text style={[styles.colPace, styles.headerText]}>{isSwim ? '/100m' : isRun ? '/km' : isBike ? 'PWR' : 'PACE'}</Text>
        <Text style={[styles.colHr, styles.headerText]}>HR</Text>
      </View>

      {/* Table */}
      <ScrollView ref={tableRef} style={styles.table} showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {normalized.map((lap, i) => (
          <LapRow key={i} lap={lap} isSelected={i === selectedIndex} sport={sport} color={color}
            onPress={() => handleSelect(i === selectedIndex ? -1 : i)} />
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    gap: 8,
  },
  headerLap:  { fontSize: 14, fontWeight: '800', color: '#111827' },
  headerDot:  { fontSize: 12, color: '#D1D5DB' },
  headerDur:  { fontSize: 13, fontWeight: '600', color: '#374151' },
  headerPace: { fontSize: 13, fontWeight: '700' },
  headerHint: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  zoomOutBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  zoomOutText: { fontSize: 11, fontWeight: '700' },

  yLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', textAlign: 'right' },
  xLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '600' },

  barItem: { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginTop: 12,
  },
  headerText: { fontSize: 10, color: '#9CA3AF', fontWeight: '700' },

  table: { maxHeight: 320 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_H,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowIndicator: { width: 3, height: ROW_H, marginRight: 8, backgroundColor: 'transparent', borderRadius: 2 },

  colIdx:   { width: 32, fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  colDist:  { width: 60, fontSize: 13, color: '#374151', fontWeight: '600' },
  colTime:  { width: 54, fontSize: 14, color: '#111827', fontWeight: '700', textAlign: 'center' },
  colPace:  { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600', textAlign: 'center' },
  colHr:    { width: 38, fontSize: 13, color: '#374151', fontWeight: '600', textAlign: 'right' },
});
