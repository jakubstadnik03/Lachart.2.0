import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import { http } from '../api/http';
import { useAuth } from '../auth/AuthContext';
import { LoadingScreen } from './LoadingScreen';
import { useNavigation } from '@react-navigation/native';
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
};

function toDateKey(dateLike: any): { dateKey: string; dateISO: string } | null {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return { dateKey: format(d, 'yyyy-MM-dd'), dateISO: d.toISOString() };
}

export function CalendarScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [items, setItems] = useState<ActivityItem[]>([]);

  const load = useCallback(async () => {
    try {
      const [stravaResp, fitResp, regularResp] = await Promise.all([
        http.get('/api/integrations/activities'),
        http.get('/api/fit/trainings'),
        user?._id ? http.get(`/user/athlete/${user._id}/trainings`) : Promise.resolve({ data: [] as any[] }),
      ]);

      const strava = (stravaResp.data || []).flatMap((a: any) => {
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
          },
        ];
      });

      const fit = (fitResp.data || []).flatMap((t: any) => {
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
          },
        ];
      });

      const regular = (regularResp.data || []).flatMap((t: any) => {
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
          },
        ];
      });

      const merged = [...strava, ...fit, ...regular].sort((a, b) => (a.dateISO < b.dateISO ? 1 : -1));
      setItems(merged);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const itemsForDay = useMemo(() => items.filter((i) => i.dateKey === selectedDate), [items, selectedDate]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const it of items) {
      if (!marks[it.dateKey]) marks[it.dateKey] = { dots: [] as any[] };
      const color =
        it.sport === 'bike' || it.sport === 'cycling'
          ? '#2563EB'
          : it.sport === 'run' || it.sport === 'running'
            ? '#10B981'
            : it.sport === 'swim' || it.sport === 'swimming'
              ? '#06B6D4'
              : '#F59E0B';
      const key = `${it.sourceType}-${it.sport || 'other'}`;
      if (!marks[it.dateKey].dots.some((d: any) => d.key === key)) {
        marks[it.dateKey].dots.push({ key, color });
      }
    }
    marks[selectedDate] = { ...(marks[selectedDate] || {}), selected: true, selectedColor: '#111827' };
    return marks;
  }, [items, selectedDate]);

  if (loading) return <LoadingScreen label="Loading calendar…" />;

  return (
    <View style={styles.container}>
      <Calendar
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
        <Text style={styles.listSubtitle}>{itemsForDay.length} trainings</Text>
      </View>

      <FlatList
        data={itemsForDay}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              const sourceType = item.sourceType as TrainingSourceType;
              navigation.navigate('TrainingDetail', {
                sourceType,
                id: String(item.id).replace(/^(strava|fit|regular)-/, ''),
                title: item.title,
                dateISO: item.dateISO,
                sport: item.sport,
                category: item.category || null,
              });
            }}
            style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.99 }], opacity: 0.95 }]}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.chipsRow}>
              <Chip label={item.sourceType.toUpperCase()} tone="gray" />
              {item.sport ? (
                <Chip
                  label={item.sport}
                  tone={
                    item.sport === 'bike' || item.sport === 'cycling'
                      ? 'blue'
                      : item.sport === 'run' || item.sport === 'running'
                        ? 'green'
                        : item.sport === 'swim' || item.sport === 'swimming'
                          ? 'cyan'
                          : 'orange'
                  }
                />
              ) : null}
              {item.category ? <Chip label={item.category} tone="orange" /> : null}
            </View>
          </Pressable>
        )}
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
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { padding: 16, color: '#6B7280' },
});


