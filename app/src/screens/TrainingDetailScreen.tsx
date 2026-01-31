import React, { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { http } from '../api/http';
import { Card, Chip, SectionTitle, StatGrid } from '../ui/components';
import { formatBpm, formatDistanceMeters, formatDuration, formatPaceSeconds, formatWatts, paceFromSpeed } from '../ui/format';

type Props = NativeStackScreenProps<RootStackParamList, 'TrainingDetail'>;

export function TrainingDetailScreen({ route, navigation }: Props) {
  const { sourceType, id, title, sport, category, dateISO } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      let resp;
      if (sourceType === 'strava') {
        resp = await http.get(`/api/integrations/strava/activities/${id}`);
      } else if (sourceType === 'fit') {
        resp = await http.get(`/api/fit/trainings/${id}`);
      } else {
        resp = await http.get(`/api/training/${id}`);
      }
      setData(resp.data);
    } catch (e: any) {
      Alert.alert('Failed to load training', e?.response?.data?.error || e?.message || 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, sourceType]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [navigation, title]);

  const header = useMemo(() => {
    const dateText = dateISO ? new Date(dateISO).toLocaleString() : '';
    const chips: Array<{ label: string; tone: any }> = [
      { label: sourceType.toUpperCase(), tone: 'gray' },
    ];
    if (sport) {
      chips.push({
        label: sport,
        tone:
          sport === 'bike' || sport === 'cycling'
            ? 'blue'
            : sport === 'run' || sport === 'running'
              ? 'green'
              : sport === 'swim' || sport === 'swimming'
                ? 'cyan'
                : 'orange',
      });
    }
    if (category) chips.push({ label: String(category), tone: 'orange' });
    return { dateText, chips };
  }, [category, dateISO, sourceType, sport]);

  const stats = useMemo(() => {
    // Normalize stats across sources
    if (sourceType === 'strava') {
      const detail = data?.detail || data || {};
      const distance = detail?.distance ?? null;
      const duration = detail?.moving_time ?? detail?.elapsed_time ?? null;
      const avgHr = detail?.average_heartrate ?? null;
      const avgPower = detail?.average_watts ?? null;
      const avgSpeed = detail?.average_speed ?? null;

      const isRun = (sport || '').toLowerCase().includes('run');
      const isSwim = (sport || '').toLowerCase().includes('swim');
      const paceSec = isRun ? paceFromSpeed(avgSpeed, 'run') : isSwim ? paceFromSpeed(avgSpeed, 'swim') : null;

      return [
        { label: 'Duration', value: duration != null ? formatDuration(duration) : '-' },
        { label: 'Distance', value: formatDistanceMeters(distance) },
        { label: 'Avg HR', value: formatBpm(avgHr) },
        { label: isRun ? 'Avg Pace' : isSwim ? 'Avg Pace' : 'Avg Power', value: isRun ? formatPaceSeconds(paceSec, '/km') : isSwim ? formatPaceSeconds(paceSec, '/100m') : formatWatts(avgPower) },
      ];
    }

    if (sourceType === 'fit') {
      const t = data || {};
      const distance = t?.totalDistance ?? t?.distance ?? null;
      const duration = t?.totalTimerTime ?? t?.moving_time ?? t?.totalElapsedTime ?? t?.duration ?? null;
      const avgHr = t?.avgHeartRate ?? t?.averageHeartRate ?? null;
      const avgPower = t?.avgPower ?? t?.averagePower ?? null;
      const avgSpeed = t?.avgSpeed ?? t?.averageSpeed ?? null;

      const isRun = (sport || t?.sport || '').toLowerCase().includes('run');
      const isSwim = (sport || t?.sport || '').toLowerCase().includes('swim');
      const paceSec = isRun ? paceFromSpeed(avgSpeed, 'run') : isSwim ? paceFromSpeed(avgSpeed, 'swim') : null;

      return [
        { label: 'Duration', value: duration != null ? formatDuration(duration) : '-' },
        { label: 'Distance', value: formatDistanceMeters(distance) },
        { label: 'Avg HR', value: formatBpm(avgHr) },
        { label: isRun ? 'Avg Pace' : isSwim ? 'Avg Pace' : 'Avg Power', value: isRun ? formatPaceSeconds(paceSec, '/km') : isSwim ? formatPaceSeconds(paceSec, '/100m') : formatWatts(avgPower) },
      ];
    }

    // regular training
    const tr = data || {};
    const duration = tr?.totalTimerTime ?? tr?.moving_time ?? tr?.totalElapsedTime ?? tr?.duration ?? null;
    const distance = tr?.totalDistance ?? tr?.distance ?? null;
    return [
      { label: 'Duration', value: duration != null ? formatDuration(duration) : '-' },
      { label: 'Distance', value: formatDistanceMeters(distance) },
      { label: 'Intervals', value: Array.isArray(tr?.results) ? String(tr.results.length) : '-' },
      { label: 'Sport', value: String(tr?.sport || sport || '-') },
    ];
  }, [data, sourceType, sport]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Card>
        <Text style={styles.title} numberOfLines={3}>
          {title || (sourceType === 'strava' ? data?.titleManual || data?.detail?.name : null) || 'Training'}
        </Text>
        {header.dateText ? <Text style={styles.subtitle}>{header.dateText}</Text> : null}
        <View style={styles.chipsRow}>
          {header.chips.map((c) => (
            <Chip key={c.label} label={c.label} tone={c.tone} />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>Summary</SectionTitle>
        <StatGrid items={stats} />
      </Card>

      {sourceType === 'strava' && Array.isArray(data?.laps) && data.laps.length > 0 ? (
        <Card>
          <SectionTitle>Intervals</SectionTitle>
          <Text style={styles.small}>Intervals: {data.laps.length}</Text>
          <Text style={styles.small}>Tip: next step is to render lap list + simple chart preview.</Text>
        </Card>
      ) : null}

      {sourceType === 'fit' && Array.isArray(data?.laps) && data.laps.length > 0 ? (
        <Card>
          <SectionTitle>Intervals</SectionTitle>
          <Text style={styles.small}>Laps: {data.laps.length}</Text>
          <Text style={styles.small}>Records: {Array.isArray(data?.records) ? data.records.length : 0}</Text>
        </Card>
      ) : null}

      {sourceType === 'regular' && Array.isArray(data?.results) && data.results.length > 0 ? (
        <Card>
          <SectionTitle>Intervals</SectionTitle>
          {data.results.slice(0, 12).map((r: any, idx: number) => (
            <View key={idx} style={styles.row}>
              <Text style={styles.rowLeft}>{idx + 1}.</Text>
              <Text style={styles.rowMid} numberOfLines={1}>
                {r?.duration || '-'}
              </Text>
              <Text style={styles.rowRight} numberOfLines={1}>
                {r?.power || '-'} {sport === 'bike' ? 'W' : ''}
              </Text>
            </View>
          ))}
          {data.results.length > 12 ? <Text style={styles.small}>…and {data.results.length - 12} more</Text> : null}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#6B7280', fontWeight: '700' },
  title: { fontSize: 20, fontWeight: '900', color: '#111827' },
  subtitle: { marginTop: 6, color: '#6B7280', fontSize: 12, fontWeight: '700' },
  chipsRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  rowLeft: { width: 24, color: '#6B7280', fontWeight: '800' },
  rowMid: { flex: 1, color: '#111827', fontWeight: '700' },
  rowRight: { width: 90, textAlign: 'right', color: '#111827', fontWeight: '800' },
});



