import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { API_BASE_URL } from '../config/env';
import { registerForPushNotificationsAsync } from '../push/registerForPushNotifications';
import { http } from '../api/http';

export function SettingsScreen() {
  const [pushToken, setPushToken] = useState<string | null>(null);

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



