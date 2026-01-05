import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { http } from '../api/http';

export function ProfileScreen() {
  const { user, refreshProfile, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await http.get('/user/profile');
        setProfile(resp.data);
      } catch (e: any) {
        // ignore; might not exist for some roles; we still show login user
      }
    };
    load();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.row}>
          <Text style={styles.k}>Name:</Text> {user?.name} {user?.surname}
        </Text>
        <Text style={styles.row}>
          <Text style={styles.k}>Email:</Text> {user?.email || '-'}
        </Text>
        <Text style={styles.row}>
          <Text style={styles.k}>Role:</Text> {user?.role || '-'}
        </Text>
      </View>

      {profile?.powerZones && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Zones</Text>
          <Text style={styles.small}>Cycling LT2: {profile.powerZones?.cycling?.lt2 ?? '-'}</Text>
          <Text style={styles.small}>Running LT2 (pace s/km): {profile.powerZones?.running?.lt2 ?? '-'}</Text>
          <Text style={styles.small}>Swimming LT2 (pace s/100m): {profile.powerZones?.swimming?.lt2 ?? '-'}</Text>
        </View>
      )}

      <View style={styles.rowButtons}>
        <Pressable
          onPress={async () => {
            try {
              await refreshProfile();
              Alert.alert('OK', 'Profile refreshed.');
            } catch (e: any) {
              Alert.alert('Error', e?.response?.data?.error || e?.message || 'Failed');
            }
          }}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryText}>Refresh</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await logout();
          }}
          style={styles.dangerBtn}
        >
          <Text style={styles.dangerText}>Logout</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 6 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 6 },
  row: { fontSize: 14, color: '#111827' },
  k: { fontWeight: '800' },
  small: { fontSize: 12, color: '#374151' },
  rowButtons: { flexDirection: 'row', gap: 10 },
  secondaryBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  secondaryText: { textAlign: 'center', fontWeight: '700', color: '#111827' },
  dangerBtn: { flex: 1, backgroundColor: '#EF4444', borderRadius: 12, padding: 12 },
  dangerText: { textAlign: 'center', fontWeight: '800', color: '#fff' },
});



