import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import { http } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { LoadingScreen } from './LoadingScreen';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, TrainingSourceType } from '../navigation/types';
import { Chip } from '../ui/components';

type ActivityItem = {
  id: string;
  dateKey: string; // yyyy-MM-dd
  dateISO: string;
  title: string;
  sport?: string;
  category?: string | null;
  sourceType: 'strava' | 'fit' | 'regular';
  raw: any;
};

type PlannedItem = {
  id: string;
  dateKey: string;
  dateISO: string;
  title: string;
  sport?: string;
  status?: string;
  completedTrainingId?: string;
  plannedSecs: number;
  raw: any;
};

type DayCard =
  | { kind: 'planned'; planned: PlannedItem; linked: ActivityItem | null }
  | { kind: 'activity'; activity: ActivityItem };

function toDateKey(dateLike: any): { dateKey: string; dateISO: string } | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return { dateKey: format(d, 'yyyy-MM-dd'), dateISO: d.toISOString() };
}

// Same matching as web (planSportMatchesActivity in WeeklyCalendar.jsx)
function planSportMatchesActivity(pwSport?: string, actSport?: string) {
  const p = String(pwSport || '').toLowerCase();
  const a = String(actSport || '').toLowerCase();
  if (!p || !a) return false;
  if (p === 'run' && (a.includes('run') || a.includes('walk') || a.includes('hike'))) return true;
  if (p === 'bike' && (a.includes('ride') || a.includes('cycle') || a.includes('bike') || a.includes('virtual'))) return true;
  if (p === 'swim' && a.includes('swim')) return true;
  if (p === 'strength' && (a.includes('weight') || a.includes('strength') || a.includes('gym'))) return true;
  return p === a;
}

function planStepTotalSecs(steps: any): number {
  if (!Array.isArray(steps)) return 0;
  let total = 0;
  for (const s of steps) {
    const reps = Number(s?.repeatCount || s?.repeats || 1) || 1;
    const dur = Number(s?.durationSeconds || s?.duration || 0) || 0;
    if (Array.isArray(s?.steps)) {
      total += reps * planStepTotalSecs(s.steps);
    } else {
      total += reps * dur;
    }
  }
  return total;
}

function pairPlannedWithDayActivities(planned: PlannedItem[], activities: ActivityItem[]) {
  const pwToAct = new Map<string, ActivityItem>();
  const claimedKeys = new Set<string>();
  if (!planned.length || !activities.length) return { pwToAct, claimedKeys };
  for (const pw of planned) {
    if (!pw.id) continue;
    const explicit = pw.completedTrainingId
      ? activities.find((a) => String(a.raw?.id ?? a.raw?._id ?? '') === String(pw.completedTrainingId))
      : null;
    const candidate =
      explicit ||
      activities.find(
        (a) =>
          !claimedKeys.has(a.id) && planSportMatchesActivity(pw.sport, a.sport || a.raw?.type || ''),
      );
    if (candidate) {
      pwToAct.set(pw.id, candidate);
      claimedKeys.add(candidate.id);
    }
  }
  return { pwToAct, claimedKeys };
}

function secsToHMShort(secs?: number) {
  if (!secs || secs <= 0) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtDistance(meters?: number) {
  if (!meters || meters <= 0) return '';
  if (meters >= 1000) {
    const km = meters / 1000;
    return km % 1 === 0 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function activityActualSecs(a: ActivityItem) {
  const r = a.raw || {};
  return Number(
    r.duration || r.moving_time || r.elapsed_time || r.movingTime || r.totalTimerTime || r.totalElapsedTime || 0,
  );
}

function activityDistanceMeters(a: ActivityItem) {
  const r = a.raw || {};
  return Number(r.distance || r.totalDistance || 0);
}

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function CalendarScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(todayKey());
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [planned, setPlanned] = useState<PlannedItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [stravaResp, fitResp, regularResp, plannedResp] = await Promise.all([
        http.get('/api/integrations/activities'),
        http.get('/api/fit/trainings'),
        user?._id ? http.get(`/user/athlete/${user._id}/trainings`) : Promise.resolve({ data: [] as any[] }),
        http.get('/api/workout-planner/planned').catch(() => ({ data: [] as any[] })),
      ]);

      const strava: ActivityItem[] = (stravaResp.data || []).flatMap((a: any) => {
        const dt = toDateKey(a.startDate || a.start_date || a.startDateLocal);
        if (!dt) return [];
        return [
          {
            id: `strava-${a.stravaId}`,
            sourceType: 'strava' as const,
            dateKey: dt.dateKey,
            dateISO: dt.dateISO,
            title: a.titleManual || a.name || 'Strava Activity',
            sport: a.sport,
            category: a.category || null,
            raw: a,
          },
        ];
      });

      const fit: ActivityItem[] = (fitResp.data || []).flatMap((t: any) => {
        const dt = toDateKey(t.timestamp);
        if (!dt) return [];
        return [
          {
            id: `fit-${t._id}`,
            sourceType: 'fit' as const,
            dateKey: dt.dateKey,
            dateISO: dt.dateISO,
            title: t.titleManual || t.titleAuto || t.originalFileName || 'FIT training',
            sport: t.sport,
            category: t.category || null,
            raw: t,
          },
        ];
      });

      const regular: ActivityItem[] = (regularResp.data || []).flatMap((t: any) => {
        const dt = toDateKey(t.date || t.timestamp);
        if (!dt) return [];
        return [
          {
            id: `regular-${t._id}`,
            sourceType: 'regular' as const,
            dateKey: dt.dateKey,
            dateISO: dt.dateISO,
            title: t.title || 'Training',
            sport: t.sport,
            category: t.category || null,
            raw: t,
          },
        ];
      });

      const merged = [...strava, ...fit, ...regular].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
      setItems(merged);

      const plannedItems: PlannedItem[] = (plannedResp.data || []).flatMap((pw: any) => {
        const dt = toDateKey(pw.date);
        if (!dt) return [];
        return [
          {
            id: String(pw._id),
            dateKey: dt.dateKey,
            dateISO: dt.dateISO,
            title: pw.title || pw.name || 'Planned workout',
            sport: pw.sport,
            status: pw.status,
            completedTrainingId: pw.completedTrainingId,
            plannedSecs: planStepTotalSecs(pw.steps) || Number(pw.plannedDuration) || 0,
            raw: pw,
          },
        ];
      });
      setPlanned(plannedItems);
    } catch (e: any) {
      Alert.alert('Failed to load calendar', e?.response?.data?.error || e?.message || 'Unknown error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?._id]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Jump to today whenever the Calendar tab is (re-)focused.
  useFocusEffect(
    useCallback(() => {
      setSelectedDate(todayKey());
    }, []),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const dayCards = useMemo<DayCard[]>(() => {
    const dayActivities = items.filter((i) => i.dateKey === selectedDate);
    const dayPlanned = planned.filter((p) => p.dateKey === selectedDate);
    const { pwToAct, claimedKeys } = pairPlannedWithDayActivities(dayPlanned, dayActivities);
    const cards: DayCard[] = [];
    for (const pw of dayPlanned) {
      cards.push({ kind: 'planned', planned: pw, linked: pwToAct.get(pw.id) || null });
    }
    for (const a of dayActivities) {
      if (claimedKeys.has(a.id)) continue;
      cards.push({ kind: 'activity', activity: a });
    }
    return cards;
  }, [items, planned, selectedDate]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const addDot = (key: string, color: string, dotKey: string) => {
      if (!marks[key]) marks[key] = { dots: [] as any[] };
      if (!marks[key].dots.some((d: any) => d.key === dotKey)) {
        marks[key].dots.push({ key: dotKey, color });
      }
    };
    const sportColor = (sport?: string) =>
      sport === 'bike' || sport === 'cycling'
        ? '#2563EB'
        : sport === 'run' || sport === 'running'
          ? '#10B981'
          : sport === 'swim' || sport === 'swimming'
            ? '#06B6D4'
            : '#F59E0B';

    for (const it of items) {
      addDot(it.dateKey, sportColor(it.sport), `${it.sourceType}-${it.sport || 'other'}`);
    }
    for (const pw of planned) {
      // softer color for planned-only days
      addDot(pw.dateKey, '#A78BFA', `planned-${pw.sport || 'other'}`);
    }
    marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: '#111827' };
    return marks;
  }, [items, planned, selectedDate]);

  if (loading) return <LoadingScreen label="Loading calendar…" />;

  const sportTone = (sport?: string) =>
    sport === 'bike' || sport === 'cycling'
      ? 'blue'
      : sport === 'run' || sport === 'running'
        ? 'green'
        : sport === 'swim' || sport === 'swimming'
          ? 'cyan'
          : 'orange';

  return (
    <View style={styles.container}>
      <Calendar
        current={selectedDate}
        markingType="multi-dot"
        markedDates={markedDates}
        onDayPress={(day) => setSelectedDate(day.dateString)}
        theme={{
          selectedDayBackgroundColor: '#111827',
          todayTextColor: '#2563EB',
          arrowColor: '#111827',
        }}
      />

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{selectedDate}</Text>
        <Text style={styles.listSubtitle}>{dayCards.length} item{dayCards.length === 1 ? '' : 's'}</Text>
      </View>

      <FlatList
        data={dayCards}
        keyExtractor={(c) => (c.kind === 'planned' ? `pw-${c.planned.id}` : `act-${c.activity.id}`)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => {
          if (item.kind === 'activity') {
            const act = item.activity;
            const secs = activityActualSecs(act);
            const dist = activityDistanceMeters(act);
            return (
              <Pressable
                onPress={() => {
                  navigation.navigate('TrainingDetail', {
                    sourceType: act.sourceType as TrainingSourceType,
                    id: String(act.id).replace(/^(strava|fit|regular)-/, ''),
                    title: act.title,
                    dateISO: act.dateISO,
                    sport: act.sport,
                    category: act.category || null,
                  });
                }}
                style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}
              >
                <Text style={styles.cardTitle} numberOfLines={2}>{act.title}</Text>
                <View style={styles.chipsRow}>
                  <Chip label={act.sourceType.toUpperCase()} tone="gray" />
                  {act.sport ? <Chip label={act.sport} tone={sportTone(act.sport)} /> : null}
                  {secs > 0 ? <Chip label={secsToHMShort(secs)} tone="gray" /> : null}
                  {dist > 0 ? <Chip label={fmtDistance(dist)} tone="gray" /> : null}
                  {act.category ? <Chip label={act.category} tone="orange" /> : null}
                </View>
              </Pressable>
            );
          }

          // planned card (optionally merged with linked activity)
          const pw = item.planned;
          const linked = item.linked;
          const linkedSecs = linked ? activityActualSecs(linked) : 0;
          const linkedDist = linked ? activityDistanceMeters(linked) : 0;
          const displaySport = linked ? linked.sport || pw.sport : pw.sport;
          const displayDur = linked && linkedSecs > 0 ? secsToHMShort(linkedSecs) : secsToHMShort(pw.plannedSecs);
          const displayDist = linked && linkedDist > 0 ? fmtDistance(linkedDist) : '';
          const isCompleted = linked != null || pw.status === 'completed';

          return (
            <Pressable
              onPress={() => {
                if (linked) {
                  navigation.navigate('TrainingDetail', {
                    sourceType: linked.sourceType as TrainingSourceType,
                    id: String(linked.id).replace(/^(strava|fit|regular)-/, ''),
                    title: pw.title,
                    dateISO: linked.dateISO,
                    sport: linked.sport || pw.sport,
                    category: linked.category || null,
                  });
                } else {
                  Alert.alert(
                    pw.title,
                    pw.plannedSecs > 0
                      ? `Planned ${secsToHMShort(pw.plannedSecs)}${pw.sport ? ` · ${pw.sport}` : ''}`
                      : 'Planned workout',
                  );
                }
              }}
              style={({ pressed }) => [
                styles.card,
                styles.plannedCard,
                isCompleted && styles.plannedCompleted,
                pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 },
              ]}
            >
              <Text style={styles.cardTitle} numberOfLines={2}>{pw.title}</Text>
              <View style={styles.chipsRow}>
                <Chip label={isCompleted ? 'COMPLETED' : 'PLANNED'} tone={isCompleted ? 'green' : 'gray'} />
                {displaySport ? <Chip label={displaySport} tone={sportTone(displaySport)} /> : null}
                {displayDur ? <Chip label={displayDur} tone="gray" /> : null}
                {displayDist ? <Chip label={displayDist} tone="gray" /> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No trainings for this day.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  listHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  listTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  listSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  plannedCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#A78BFA',
  },
  plannedCompleted: {
    borderLeftColor: '#10B981',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { padding: 16, color: '#6B7280' },
});
