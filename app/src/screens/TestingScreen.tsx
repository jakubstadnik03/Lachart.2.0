import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePremium } from '../premium/usePremium';
import { PremiumLocked } from '../premium/PremiumLocked';
import { FREE_LIMITS } from '../premium/features';

export function TestingScreen() {
  const { can, isPremium } = usePremium();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={styles.title}>Testing</Text>

      {!can('unlimitedTests') && (
        <PremiumLocked
          featureName="Lactate Testing"
          description={
            isPremium
              ? 'Run unlimited lactate tests, save history, and build training zones.'
              : `Free accounts can view their last ${FREE_LIMITS.maxTestsHistory} tests. Premium unlocks unlimited testing, full history, advanced zones, workout builder and PDF export.`
          }
        />
      )}

      {can('unlimitedTests') && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Lactate test</Text>
          <Text style={styles.small}>
            Next step: port lactate test flow (form + curve chart + "Send to email").
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  small: { fontSize: 13, color: '#374151' },
});
