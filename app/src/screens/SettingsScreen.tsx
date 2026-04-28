import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { API_BASE_URL } from '../config/env';
import { registerForPushNotificationsAsync } from '../push/registerForPushNotifications';
import { http } from '../api/http';
import {
  isAppleHealthAvailable,
  requestAppleHealthPermissions,
  fetchRecentWorkouts,
} from '../health/appleHealth';

export function SettingsScreen() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [healthSynced, setHealthSynced] = useState<number | null>(null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.card}>
        <Text style={styles.row}>
          <Text style={styles.k}>API base:</Text> {API_BASE_URL}
        </Text>
        <Text style={styles.small}>
          For real device, set env var <Text style={{ fontWeight: '800' }}>EXPO_PUBLIC_API_URL</Text> to your LAN IP.
        </Text>
      </View>

      {/* Apple Health */}
      {isAppleHealthAvailable() && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🍎 Apple Health</Text>
          <Text style={styles.small}>
            Sync your workouts from Apple Health to LaChart. Reads the last 90 days on first sync.
          </Text>

          {healthSynced !== null && (
            <Text style={[styles.small, { color: '#059669', fontWeight: '700' }]}>
              ✓ {healthSynced} workout{healthSynced !== 1 ? 's' : ''} synced
            </Text>
          )}
          {healthStatus === 'error' && (
            <Text style={[styles.small, { color: '#DC2626' }]}>
              Sync failed. Make sure HealthKit access is granted in Settings → Health → Data Access.
            </Text>
          )}

          <Pressable
            style={[styles.primaryBtn, healthStatus === 'syncing' && { opacity: 0.5 }]}
            disabled={healthStatus === 'syncing'}
            onPress={async () => {
              setHealthStatus('syncing');
              setHealthSynced(null);
              try {
                const granted = await requestAppleHealthPermissions();
                if (!granted) {
                  Alert.alert(
                    'Permission denied',
                    'Please allow Health access in Settings → Privacy & Security → Health → LaChart.',
                  );
                  setHealthStatus('error');
                  return;
                }

                // Fetch last 90 days (or last sync date from server)
                const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
                const workouts = await fetchRecentWorkouts(since);

                if (workouts.length === 0) {
                  Alert.alert('No workouts', 'No new Apple Health workouts found in the last 90 days.');
                  setHealthStatus('done');
                  setHealthSynced(0);
                  return;
                }

                const { data } = await http.post('/api/integrations/apple-health/sync', { workouts });
                const imported = data.imported ?? workouts.length;
                setHealthSynced(imported);
                setHealthStatus('done');
                Alert.alert('Sync complete', `${imported} workout${imported !== 1 ? 's' : ''} imported from Apple Health.`);
              } catch (e: any) {
                console.error('Apple Health sync error:', e);
                setHealthStatus('error');
                Alert.alert('Sync error', e?.response?.data?.error || e?.message || 'Unknown error');
              }
            }}
          >
            <Text style={styles.primaryText}>
              {healthStatus === 'syncing' ? 'Syncing…' : 'Sync from Apple Health'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Push Notifications</Text>
        <Text style={styles.small}>Token: {pushToken || '-'}</Text>

        <Pressable
          style={styles.primaryBtn}
          onPress={async () => {
            const tok = await registerForPushNotificationsAsync();
            setPushToken(tok);
            if (!tok) {
              Alert.alert('Push not available', 'Use a real device and allow notifications.');
              return;
            }
            try {
              await http.post('/user/push-token', { expoPushToken: tok });
              Alert.alert('OK', 'Push token registered on server.');
            } catch (e: any) {
              Alert.alert('Server error', e?.response?.data?.error || e?.message || 'Failed');
            }
          }}
        >
          <Text style={styles.primaryText}>Register push token</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={async () => {
            const perms = await Notifications.getPermissionsAsync();
            Alert.alert('Push permissions', JSON.stringify(perms, null, 2));
          }}
        >
          <Text style={styles.secondaryText}>Show permissions</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  row: { fontSize: 14, color: '#111827' },
  k: { fontWeight: '800' },
  small: { fontSize: 12, color: '#374151' },
  primaryBtn: { backgroundColor: '#111827', borderRadius: 12, padding: 12 },
  primaryText: { textAlign: 'center', fontWeight: '800', color: '#fff' },
  secondaryBtn: { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  secondaryText: { textAlign: 'center', fontWeight: '700', color: '#111827' },
});



