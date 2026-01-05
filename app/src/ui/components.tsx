import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Chip({ label, tone = 'gray' }: { label: string; tone?: 'gray' | 'blue' | 'green' | 'cyan' | 'orange' }) {
  return (
    <View style={[styles.chip, toneStyles[tone].bg]}>
      <Text style={[styles.chipText, toneStyles[tone].text]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function StatGrid({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={styles.grid}>
      {items.map((it) => (
        <View key={it.label} style={styles.tile}>
          <Text style={styles.tileLabel}>{it.label}</Text>
          <Text style={styles.tileValue} numberOfLines={1}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const toneStyles = {
  gray: { bg: { backgroundColor: '#F3F4F6' }, text: { color: '#111827' } },
  blue: { bg: { backgroundColor: '#DBEAFE' }, text: { color: '#1D4ED8' } },
  green: { bg: { backgroundColor: '#D1FAE5' }, text: { color: '#047857' } },
  cyan: { bg: { backgroundColor: '#CFFAFE' }, text: { color: '#0E7490' } },
  orange: { bg: { backgroundColor: '#FFEDD5' }, text: { color: '#9A3412' } },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#111827', marginBottom: 8 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tileLabel: { fontSize: 11, color: '#6B7280', fontWeight: '700' },
  tileValue: { marginTop: 4, fontSize: 15, color: '#111827', fontWeight: '800' },
});



