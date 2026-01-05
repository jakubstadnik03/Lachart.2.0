import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

export function DashboardScreen() {
  const { user } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.card}>Welcome{user?.name ? `, ${user.name}` : ''}.</Text>
      <Text style={styles.note}>
        This is the MVP shell. Next we’ll port the key charts (Spider/Form) with RN-friendly chart libs.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 16, color: '#111827' },
  note: { fontSize: 13, color: '#6B7280' },
});



