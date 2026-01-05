import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function TestingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Testing</Text>
      <Text style={styles.note}>
        Next step: port Lactate test flow (form + curve chart + “Send to email”).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  note: { fontSize: 13, color: '#6B7280' },
});



