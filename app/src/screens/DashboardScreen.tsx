import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { usePremium } from '../premium/usePremium';
import { PremiumLocked } from '../premium/PremiumLocked';

export function DashboardScreen() {
  const { user } = useAuth();
  const { can, isCoach, tier } = usePremium();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.title}>Dashboard</Text>
      <Text style={styles.card}>Welcome{user?.name ? `, ${user.name}` : ''}.</Text>

      {/* Coach-only section */}
      {user?.role === 'coach' && !can('manageAthletes') && (
        <PremiumLocked
          featureName="Manage Athletes"
          description="Coach Premium lets you add unlimited athletes, view their tests and trainings, plan workouts, and compare progress side-by-side."
        />
      )}

      {user?.role === 'coach' && !can('coachDashboard') && (
        <PremiumLocked
          featureName="Coach Dashboard"
          description="Track all your athletes from one dashboard — load, form, lactate trends and upcoming tests."
          compact
        />
      )}

      {tier === 'free' && (
        <Text style={styles.note}>
          You're on the Free plan. Premium features are managed on the LaChart website.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, fontSize: 16, color: '#111827' },
  note: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 8 },
});
